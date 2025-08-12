#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

# Accept a sample via file or use a default Zeek HTTP-ish line
SAMPLE="${1:-}"
if [[ -z "$SAMPLE" ]]; then
  SAMPLE=$'1725000000\tGET\t/\texample.com\t200\tMozilla/5.0'
fi

body="$(jq -n --arg s "$SAMPLE" 'if ($s|test("^\\s*[\\[{]")) then {record:($s|fromjson)} else {raw:$s} end')"

note "detect"
api /api/v2/parse/detect "$body" | tee "$ART_DIR/detect_smoke.json" >/dev/null && jq . "$ART_DIR/detect_smoke.json"


