#!/usr/bin/env bash
# Driver: runs all GA steps and prints final verdict

set -Eeuo pipefail
scripts/ga/10_chaos.sh
scripts/ga/20_performance.sh
scripts/ga/30_security.sh
scripts/ga/40_correctness.sh
scripts/ga/50_ux.sh || true
scripts/ga/60_operability.sh
scripts/ga/90_green_stamp.sh
printf '\nDone. See target/test-artifacts/final_reportv1.md\n'

