#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

note "metrics slice"
curl -fsS "$BASE_URL/metrics" \
  | egrep '^(siem_v2_(compile_total|search_execute_seconds|rules_run_total|alerts_written_total)|siem_eps_throttles_total)' \
  | tee "$ART_DIR/metrics_slice.txt" >/dev/null || true

[[ -s "$ART_DIR/metrics_slice.txt" ]] && sed -n '1,80p' "$ART_DIR/metrics_slice.txt" || echo "(no counters yet)"


