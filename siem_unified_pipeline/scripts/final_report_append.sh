#!/usr/bin/env bash
set -euo pipefail
OUT="siem_unified_pipeline/target/test-artifacts/final_reportv1.md"
TS="$(date -u +%FT%TZ)"

mkdir -p "$(dirname "$OUT")"

{
  echo "## V2 Guardrails & Evidence ($TS)"
  echo ""
  echo "### Guardrails"
  echo "- MAX_ROWS=10_000  ·  MAX_RANGE=7d  ·  QUERY_TIMEOUT=8s"
  echo "- Regex guard: timeout+mem cap, denylist"
  echo ""
  echo "### SHOW CREATE"
  echo '```sql'; clickhouse client -q "SHOW CREATE TABLE dev.alerts"; echo '```'
  echo '```sql'; clickhouse client -q "SHOW CREATE TABLE dev.alert_rules"; echo '```'
  echo '```sql'; clickhouse client -q "SHOW CREATE TABLE dev.rule_state"; echo '```'
  echo ""
  echo "### Counts"
  echo '```txt'
  clickhouse client -q "SELECT 'alerts' AS t, count() FROM dev.alerts
                        UNION ALL SELECT 'rules', count() FROM dev.alert_rules
                        UNION ALL SELECT 'rule_state', count() FROM dev.rule_state"
  echo '```'
  echo ""
  echo "### Curl proofs (summaries)"
  for f in compile.json estimate.json execute.json facets.json sigma_compile.json sigma_create.json alerts.json; do
    p="siem_unified_pipeline/target/test-artifacts/$f"
    [ -f "$p" ] || continue
    echo "**$f**"
    echo '```json'
    jq -c 'del(.sql,.dsl,.data.rows) | . as $o | if $o.data and $o.data.rows then {status,meta:.meta,timings_ms:.timings_ms,rows:($o.data.rows|length)} else . end' "$p" || cat "$p"
    echo '```'
  done
} >>"$OUT"

echo "Appended to $OUT"


