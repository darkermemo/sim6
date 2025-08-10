#!/usr/bin/env bash
set -euo pipefail

# Placeholder bootstrap - replace with your migrations as needed
echo "ClickHouse bootstrap: starting"
clickhouse client -q "SELECT 1" >/dev/null 2>&1 || { echo "ClickHouse not ready"; exit 1; }
echo "ClickHouse bootstrap: OK"


