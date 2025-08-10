#!/usr/bin/env bash
set -Eeuo pipefail

echo "ClickHouse bootstrap: starting"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
CH_USER="${CH_LOADER_USER:-loader}"
CH_PASS="${CH_LOADER_PASS:-loaderpass}"

curl -sS "$CLICKHOUSE_URL/" --data-binary "SELECT 1" >/dev/null

# Create loader user/role and QUOTA caps (idempotent)
curl -sS "$CLICKHOUSE_URL/" --data-binary "CREATE USER IF NOT EXISTS $CH_USER IDENTIFIED WITH plaintext_password BY '$CH_PASS'" >/dev/null || true
curl -sS "$CLICKHOUSE_URL/" --data-binary "CREATE QUOTA IF NOT EXISTS siem_loader_quota FOR INTERVAL 1 second MAX queries 50, max errors 0, max result rows 0, max execution time 0 TO $CH_USER" >/dev/null || true
curl -sS "$CLICKHOUSE_URL/" --data-binary "CREATE QUOTA IF NOT EXISTS siem_loader_quota_min FOR INTERVAL 1 minute MAX queries 3000 TO $CH_USER" >/dev/null || true

echo "ClickHouse bootstrap: loader user and quotas configured"


