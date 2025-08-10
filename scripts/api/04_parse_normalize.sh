#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

TENANT="${1:-default}"
LINES="${2:-3}"

# Build a small sample set (mix JSON and raw)
read -r -d '' RAW1 <<'L'
%ASA-6-305011: Built TCP connection from 10.1.2.3 to 10.9.8.7
L
read -r -d '' JSON1 <<'J'
{"protoPayload":{"methodName":"storage.objects.get","requestMetadata":{"callerIp":"10.2.3.4"}}, "severity":"NOTICE"}
J
read -r -d '' RAW2 <<'L'
1725000001	GET	/	portal.local	200	Mozilla/5.0
L

mapfile -t samples < <(printf '%s\n' "$RAW1" "$JSON1" "$RAW2" | head -n "$LINES")

# Build request with {samples: [...]} (strings or JSON)
tmp="$(mktemp)"
{
  echo '['
  for i in "${!samples[@]}"; do
    s="${samples[$i]}"
    if jq -e . >/dev/null 2>&1 <<<"$s"; then
      printf '%s' "$s"
    else
      jq -n --arg r "$s" -c '$r'
    fi
    [[ $i -lt $((${#samples[@]}-1)) ]] && echo ','
  done
  echo ']"
} > "$tmp"

req="$(jq -n --arg t "$TENANT" --slurpfile arr "$tmp" '{tenant_id:$t, samples:$arr[0]}')"
rm -f "$tmp"

note "normalize (batch)"
api /api/v2/parse/normalize "$req" | tee "$ART_DIR/normalize_smoke.json" >/dev/null && jq . "$ART_DIR/normalize_smoke.json"

