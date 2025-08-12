#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
ART_DIR="target/test-artifacts"
GEN_DIR="target/generated"
mkdir -p "$ART_DIR"

note() { printf '[parse] %s\n' "$*"; }

# 1) Health: always write a JSON file
note "health"
if curl -fsS "$BASE_URL/api/v2/health" -H 'accept: application/json' -o "$ART_DIR/health.json"; then
  :
else
  printf '{"status":"unknown","error":"health endpoint not reachable"}\n' > "$ART_DIR/health.json"
fi

# Helper: detect one raw line (JSON vs non-JSON) using our current API (record/raw)
call_detect() {
  local raw_line="$1"
  local req
  if jq -e . >/dev/null 2>&1 <<<"$raw_line"; then
    req=$(jq -cn --argjson rec "$raw_line" '{record:$rec}')
  else
    req=$(jq -cn --arg raw "$raw_line" '{raw:$raw}')
  fi
  curl -fsS -X POST "$BASE_URL/api/v2/parse/detect" -H 'content-type: application/json' --data-binary "$req" || echo '{}'
}

# Helper: normalize one raw line to our current endpoint (single record)
call_normalize() {
  local raw_line="$1" tenant="${2:-default}"
  local req
  if jq -e . >/dev/null 2>&1 <<<"$raw_line"; then
    req=$(jq -cn --arg t "$tenant" --argjson rec "$raw_line" '{tenant_id:$t, record:$rec}')
  else
    req=$(jq -cn --arg t "$tenant" --arg raw "$raw_line" '{tenant_id:$t, raw:$raw}')
  fi
  # Return body regardless of code; if 422, we still want error evidence
  curl -sS -w "\n%{http_code}" -X POST "$BASE_URL/api/v2/parse/normalize" -H 'content-type: application/json' --data-binary "$req"
}

# Sources and corresponding generated raw files
SOURCES=(
  okta-system-log "$GEN_DIR/okta-system-log.raw"
  gcp-audit       "$GEN_DIR/gcp-audit.raw"
  zeek-http       "$GEN_DIR/zeek-http.raw"
)

acc_hits=0
acc_total=0
cov_scores=()

for ((i=0; i<${#SOURCES[@]}; i+=2)); do
  name="${SOURCES[i]}"
  path="${SOURCES[i+1]}"
  note "processing $name from $path"
  [ -s "$path" ] || { note "missing $path"; continue; }
  idx=0
  tmp_head="/tmp/_pv_head_${name}.txt"
  # Use the first 10 non-comment, non-empty lines to avoid Zeek header records skewing detection/coverage
  head -n 50 "$path" | grep -v '^#' | sed '/^\s*$/d' | head -n 10 > "$tmp_head" || true
  while IFS= read -r raw_line || [ -n "$raw_line" ]; do
    # Detect
    det_json=$(call_detect "$raw_line")
    conf=$(jq -r '.confidence // 0' <<<"$det_json" 2>/dev/null || echo 0)
    ok=$(jq -r --argjson c "$conf" '($c>=0.98)' <<<"{}")
    if [ "$ok" = "true" ]; then acc_hits=$((acc_hits+1)); fi
    acc_total=$((acc_total+1))
    # Normalize
    norm_resp=$(call_normalize "$raw_line" "default")
    http_code="$(printf '%s' "$norm_resp" | tail -n1)"
    body="$(printf '%s' "$norm_resp" | sed '$d')"
    if [ "$http_code" = "200" ]; then
      # Handler returns coverage as a float (0..1)
      score=$(jq -r '.coverage // 0' <<<"$body" 2>/dev/null || echo 0)
      cov_scores+=("${score}")
    else
      cov_scores+=("0")
    fi
    idx=$((idx+1))
  done < "$tmp_head"
  printf '%s\n' "$det_json" > "$ART_DIR/detect_${name}.json" || true
  # Save last normalize body for evidence if present
  [ -n "${body:-}" ] && printf '%s\n' "$body" > "$ART_DIR/normalize_${name}.json" || true
done

# Compute accuracy (simple ratio)
acc=0
if [ "$acc_total" -gt 0 ]; then
  # Use bc for decimal division portably if available; otherwise integer
  acc=$(printf '%s\n' "scale=4;$acc_hits/$acc_total" | bc 2>/dev/null || echo 0)
fi

# Compute min coverage across samples (conservative gate)
min_cov=1
for s in "${cov_scores[@]:-}"; do
  # compare as floats via awk
  is_less=$(awk -v a="$s" -v b="$min_cov" 'BEGIN{print (a+0<b+0)?"1":"0"}')
  if [ "$is_less" = "1" ]; then min_cov="$s"; fi
done

jq -n --argjson acc "${acc:-0}" --argjson cov "${min_cov:-0}" '{detect_accuracy:$acc,coverage:$cov}' > "$ART_DIR/parse_gate.json"

pass=$(jq -r --argjson acc "${acc:-0}" --argjson cov "${min_cov:-0}" '($acc>=0.98) and ($cov>=0.95)' <<<"{}")
if [ "$pass" = "true" ]; then
  note "gates PASSED (acc=$acc cov=$min_cov)"
  printf 'GATES_PASSED acc=%s cov=%s\n' "$acc" "$min_cov" > "$ART_DIR/parse_gate.ok"
else
  note "gates FAILED (acc=$acc cov=$min_cov)"
  printf 'GATES_FAILED acc=%s cov=%s\n' "$acc" "$min_cov" > "$ART_DIR/parse_gate.err"
  exit 1
fi
