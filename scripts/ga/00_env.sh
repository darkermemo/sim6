#!/usr/bin/env bash
# Common env + helpers for GA proofs

set -Eeuo pipefail
export BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
export CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
export CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-dev}"
export TENANT="${TENANT:-default}"
export ART_DIR="target/test-artifacts"
export GA_DIR="target/ga"
mkdir -p "$ART_DIR" "$GA_DIR"

post_sql() {  # POST SQL to ClickHouse (HTTP)
  curl -sS "$CLICKHOUSE_URL/" --data-binary "$1"
}

note(){ printf '[ga] %s\n' "$*"; }
save_json(){ # args: file json
  printf '%s\n' "$2" > "$1"
}

