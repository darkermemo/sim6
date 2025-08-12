#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
mkdir -p "$ART"

echo "[restart_api] Stopping existing API process..."
pkill -f siem-pipeline 2>/dev/null || true
if [ -f "$ART/api_pid.txt" ]; then
    kill -9 "$(cat "$ART/api_pid.txt")" 2>/dev/null || true
fi

echo "[restart_api] Building fresh binary..."
cd "$ROOT/siem_unified_pipeline"
cargo build --bin siem-pipeline

echo "[restart_api] Starting API..."
nohup cargo run --bin siem-pipeline >"$ART/api_stdout.log" 2>"$ART/api_stderr.log" &
echo $! > "$ART/api_pid.txt"

echo "[restart_api] Waiting for API to be ready..."
for i in {1..30}; do 
    if curl -sS http://127.0.0.1:9999/api/v2/health >/dev/null 2>&1; then
        echo "[restart_api] API is ready after $i seconds"
        break
    fi
    sleep 1
done

echo "[restart_api] API PID: $(cat "$ART/api_pid.txt")"
