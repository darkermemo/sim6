#!/usr/bin/env bash
set -Eeuo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

for s in 01_health.sh 02_tenants.sh 03_parse_detect.sh 04_parse_normalize.sh 05_search_compile.sh 06_search_execute.sh 07_rules.sh 08_sigma.sh 09_alerts.sh 10_metrics.sh 11_gate_quick.sh; do
  echo "---- RUN $s ----"
  bash "$DIR/$s"
done


