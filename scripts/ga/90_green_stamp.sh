#!/usr/bin/env bash
# Produce the Green Stamp GA section in final_reportv1.md

set -Eeuo pipefail
source scripts/ga/00_env.sh

stamp_ok="true"

# A) Reliability signals
dup=$(jq -r '.dup_alert_ids_last_10m // 0' "$GA_DIR/dup_check.json" 2>/dev/null || echo 0)
[ "${dup:-0}" -eq 0 ] || stamp_ok="false"

errs=$(jq -r '.data | length' "$GA_DIR/rule_errors.json" 2>/dev/null || echo 0)
[ "${errs:-0}" -eq 0 ] || stamp_ok="false"

# B) Parser fuzz all 200
ok=$(jq -r '.ok // 0' "$GA_DIR/parser_fuzz.json" 2>/dev/null || echo 0)
tot=$(jq -r '.total // 0' "$GA_DIR/parser_fuzz.json" 2>/dev/null || echo 0)
[ "$ok" = "$tot" ] || stamp_ok="false"

# C) Core rules hit count
hits=$(jq -r '.hits // 0' "$GA_DIR/rules_hits.json" 2>/dev/null || echo 0)
[ "${hits:-0}" -ge 4 ] || stamp_ok="false"

# D) Perf EPS present
eps=$(jq -r '.eps // 0' "$GA_DIR/ingest_eps.json" 2>/dev/null || echo 0)
[ "${eps:-0}" -gt 0 ] || stamp_ok="false"

ts=$(date -u +%FT%TZ)
{
  echo "## Green Stamp GA ($ts)"
  echo ""
  echo "**Health:**";     [ -f "$GA_DIR/health_after_bounce.json" ] && jq -c . "$GA_DIR/health_after_bounce.json" || echo "{}"
  echo ""
  echo "**Reliability:** dup_alert_ids_last_10m=$dup ; rule_errors_last_10m=$errs"
  echo ""
  echo "**Parser fuzz:** $(cat "$GA_DIR/parser_fuzz.json" 2>/dev/null || echo '{}')"
  echo ""
  echo "**Rule hits (6 checks):** $(cat "$GA_DIR/rules_hits.json" 2>/dev/null || echo '{}')"
  echo ""
  echo "**Ingest EPS:** $(cat "$GA_DIR/ingest_eps.json" 2>/dev/null || echo '{}')"
  echo ""
  echo "**Execute latency (30x):** $(cat "$GA_DIR/execute_latency.json" 2>/dev/null || echo '{}')"
  echo ""
  echo "**Security admin mode:** $(cat "$GA_DIR/admin_auth.json" 2>/dev/null || echo '{}')"
  echo ""
  echo "**Metrics snapshot present:** $([ -s "$GA_DIR/metrics.txt" ] && echo yes || echo no)"
  echo ""
  echo "**Verdict:** $( [ "$stamp_ok" = "true" ] && echo "PASS" || echo "REVIEW")"
  echo ""
} >> "$ART_DIR/final_reportv1.md"

printf '%s\n' "$stamp_ok" > "$GA_DIR/ga_pass.flag"
note "Appended Green Stamp GA → $ART_DIR/final_reportv1.md (verdict=$stamp_ok)"

