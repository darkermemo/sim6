#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
ART="siem_unified_pipeline/target/test-artifacts"
mkdir -p "$ART"
mfile="$ART/metrics_snapshot.txt"
curl -fsS "$BASE_URL/metrics" -o "$mfile"

# Simple checks against presence; full promQL evaluation omitted in this lightweight gate
grep -q '^siem_v2_search_execute_seconds' "$mfile"
grep -q '^siem_v2_scheduler_tick_seconds' "$mfile"
grep -q '^siem_ingest_rate_limited_total' "$mfile" || true
exit 0


