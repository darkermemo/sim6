#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
ART_DIR="siem_unified_pipeline/target/test-artifacts"
mkdir -p "$ART_DIR"

fail=0
log="$ART_DIR/canary.log"
rm -f "$log"; : > "$log"

mkdsl(){
  local term="$1"; local out="$2"
  cat > "$out" <<'JSON'
{
  "search": {
    "tenant_ids": ["default"],
    "time_range": { "last_seconds": 600 },
    "where": { "op":"contains", "args":["message", "TERM"] },
    "limit": 10
  }
}
JSON
  sed -i '' "s/TERM/${term}/g" "$out" || sed -i "s/TERM/${term}/g" "$out"
}

run_one(){
  local name="$1"; local term="$2";
  local dsl="/tmp/canary_${name}.json"
  mkdsl "$term" "$dsl"
  # compile
  curl -fsS -X POST "$BASE_URL/api/v2/search/compile" -H 'content-type: application/json' --data-binary @"$dsl" -o "$ART_DIR/canary_${name}_compile.json"
  # execute (expects { dsl: ... })
  jq -c '{dsl: .}' "$dsl" > "/tmp/canary_${name}_exec.json"
  curl -fsS -X POST "$BASE_URL/api/v2/search/execute" -H 'content-type: application/json' --data-binary @"/tmp/canary_${name}_exec.json" -o "$ART_DIR/canary_${name}_execute.json"
  # basic assert: JSON present
  if ! jq -e . "$ART_DIR/canary_${name}_execute.json" >/dev/null 2>&1; then
    echo "canary $name failed" >> "$log"; fail=$((fail+1))
  fi
}

run_one quick1 error
run_one quick2 login
run_one quick3 info

echo "Canaries complete with fail=$fail" >> "$log"
echo "$fail" > "$ART_DIR/canary_fail_count.txt"
exit 0


