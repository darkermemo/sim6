#!/usr/bin/env bash
set -euo pipefail
ART=target/test-artifacts
mkdir -p "$ART"
ISOLATED_PASS=$(ls "$ART"/isolated-*.json 2>/dev/null | wc -l | xargs)
E2E_PASS=$(ls "$ART"/e2e-*.json 2>/dev/null | wc -l | xargs)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > status.md <<MD
# Status (last updated $NOW UTC)

## Quick Indicators
- Isolated tests with artifacts: **$ISOLATED_PASS**
- E2E tests with artifacts: **$E2E_PASS**

## Artifacts
See \`target/test-artifacts/\`.

## Full Report
See \`reports/integration_status.md\` and \`reports/integration_findings.json\`.
MD