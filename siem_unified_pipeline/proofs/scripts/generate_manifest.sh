#!/usr/bin/env bash
set -euo pipefail

# Generate manifest.json for proof run
PROOF_DIR="$1"
TIMESTAMP="$2"
GIT_SHA="$3"
GIT_BRANCH="$4"
OPERATOR="$5"

START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$PROOF_DIR/manifest.json" << EOF
{
  "run_id": "${TIMESTAMP}-${GIT_SHA}",
  "commit": "${GIT_SHA}",
  "branch": "${GIT_BRANCH}",
  "operator": "${OPERATOR}",
  "started_at": "${START_TIME}",
  "ended_at": "TBD",
  "status": "RUNNING",
  "stages": {
    "env_probe": {"status": "PENDING", "artifacts": ["sys/env.json", "sys/versions.json"]},
    "ingest": {"status": "PENDING", "artifacts": ["ingest/kafka-topics.json", "ingest/consumer-lag.json", "ingest/dlq-metrics.json", "ingest/agent-heartbeats.json"]},
    "clickhouse": {"status": "PENDING", "artifacts": ["ch/tables.sql", "ch/projections.txt", "ch/ttl_retention.txt", "ch/mv_status.json", "ch/perf_p95_ms.json"]},
    "api": {"status": "PENDING", "artifacts": ["health/summary.json", "health/stream.ndjson", "health/diagnose_clickhouse.json", "ui/route-audit.json"]},
    "detections": {"status": "PENDING", "artifacts": ["detections/compiler-golden/", "detections/run-previews.json"]},
    "sims": {"status": "PENDING", "artifacts": ["sims/runs/"]},
    "ui": {"status": "PENDING", "artifacts": ["ui/cypress-report.json", "ui/lighthouse-report.json"]},
    "security": {"status": "PENDING", "artifacts": ["security/rbac-deny.json", "security/tenancy-isolation.json", "security/audit-log.ndjson"]},
    "health": {"status": "PENDING", "artifacts": ["health/autofix_dryrun.json"]}
  },
  "thresholds": {
    "parser_success_pct": 97,
    "execute_p95_ms": 1200,
    "aggs_p95_ms": 1500,
    "kafka_lag_max": 500,
    "sse_interval_max_s": 2,
    "console_errors": 0
  },
  "environment": {
    "pwd": "$(pwd)",
    "user": "$(whoami)",
    "hostname": "$(hostname)",
    "os": "$(uname -s)",
    "arch": "$(uname -m)"
  }
}
EOF

# Copy evidence matrix
cp proofs/templates/matrix.csv "$PROOF_DIR/matrix.csv"

echo "✅ Manifest generated: $PROOF_DIR/manifest.json"
