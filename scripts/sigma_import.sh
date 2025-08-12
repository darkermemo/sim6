#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
ART="siem_unified_pipeline/target/test-artifacts"
mkdir -p "$ART"

RULES_DIR="rules/sigma"
if [ ! -d "$RULES_DIR" ]; then
  echo "No $RULES_DIR directory; create it with YAML rules to import." >&2
  exit 0
fi

for f in $(ls -1 "$RULES_DIR"/*.yml "$RULES_DIR"/*.yaml 2>/dev/null || true); do
  name=$(basename "$f" | sed 's/\.[^.]*$//')
  jq -n --arg y "$(cat "$f")" '{sigma:$y, tenant_scope:"all", severity:"HIGH"}' \
    | curl -fsS -X POST "$BASE_URL/api/v2/rules/sigma" -H 'content-type: application/json' --data-binary @- \
    | tee "$ART/sigma_create_${name}.json" >/dev/null
done

echo "Imported Sigma rules from $RULES_DIR"


