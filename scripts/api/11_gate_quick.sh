#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/00_env.sh"

# 1) Health
bash "$(dirname "$0")/01_health.sh"

# 2) Tenants (create + limits)
bash "$(dirname "$0")/02_tenants.sh" "ci_${RANDOM}"

# 3) Parse detect/normalize
bash "$(dirname "$0")/03_parse_detect.sh"
bash "$(dirname "$0")/04_parse_normalize.sh" default 3

# 4) Compile + Execute
bash "$(dirname "$0")/05_search_compile.sh"
bash "$(dirname "$0")/06_search_execute.sh"

# 5) Rule (create + run-now)
bash "$(dirname "$0")/07_rules.sh"

# 6) Sigma path
bash "$(dirname "$0")/08_sigma.sh"

# 7) Alerts + Metrics
bash "$(dirname "$0")/09_alerts.sh"
bash "$(dirname "$0")/10_metrics.sh"

echo "✅ QUICK GATE PASS. Artifacts in: $ART_DIR"


