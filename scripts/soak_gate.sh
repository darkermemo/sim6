#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ART="$ROOT/target/soak"
SUM="$ART/soak_summary.json"

if [ ! -f "$SUM" ]; then
  echo "soak_summary.json not found at $SUM" >&2
  exit 2
fi

# Extract fields safely; default to 0/false
alerts_delta=$(jq -r '.metrics.alerts_written_total.delta // 0' "$SUM" 2>/dev/null || echo 0)
ruleerr_delta=$(jq -r '.metrics.rules_run_error_total.delta // 0' "$SUM" 2>/dev/null || echo 0)
dup_sum=$(jq -r '.idempotency.dup_alert_ids_last_30m // 0' "$SUM" 2>/dev/null || echo 0)
within=$(jq -r '.resources.within_10pct // false' "$SUM" 2>/dev/null || echo false)

PASS=1
if [ "${alerts_delta:-0}" -le 0 ]; then echo "FAIL: alerts_written_total.delta <= 0"; PASS=0; fi
if [ "${ruleerr_delta:-0}" -gt 0 ]; then echo "FAIL: rules_run_error_total.delta > 0"; PASS=0; fi
if [ "${dup_sum:-0}" -gt 0 ]; then echo "FAIL: dup_alert_ids_last_30m > 0"; PASS=0; fi
if [ "${within}" != "true" ]; then echo "FAIL: resources.within_10pct != true"; PASS=0; fi

echo "Summary:"; sed -n '1,200p' "$SUM" || true

if [ "$PASS" -eq 1 ]; then
  echo "SOAK GATE: PASS"
  exit 0
else
  echo "SOAK GATE: FAIL"
  exit 1
fi

