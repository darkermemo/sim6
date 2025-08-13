#!/usr/bin/env bash
set -euo pipefail
ART="target/test-artifacts"; mkdir -p "$ART"

# 0) Preconditions check (non-fatal)
command -v rustc >/dev/null || echo "[warn] rustc not found"
command -v node >/dev/null || echo "[warn] node not found"
command -v npm >/dev/null || echo "[warn] npm not found"
command -v clickhouse >/dev/null || echo "[warn] clickhouse not found (ensure server is running via brew/services or systemd)"

# 1) Free ports
if command -v lsof >/dev/null 2>&1; then
  lsof -ti tcp:9999 | xargs -r kill -9 || true
  lsof -ti tcp:5173 | xargs -r kill -9 || true
fi
pkill -f siem-pipeline 2>/dev/null || true
pkill -f "vite|preview" 2>/dev/null || true

# 2) ClickHouse minimal init (safe/no-op if exists)
if curl -fsS http://127.0.0.1:8123 -d 'SELECT 1' >/dev/null; then
  echo "[ch] OK"
  curl -fsS http://127.0.0.1:8123 -d 'CREATE DATABASE IF NOT EXISTS dev' >/dev/null || true
  curl -fsS http://127.0.0.1:8123 -d "
CREATE TABLE IF NOT EXISTS dev.events
(
  tenant_id LowCardinality(String),
  event_timestamp DateTime64(3),
  message String,
  source_seq UInt64
)
ENGINE = MergeTree
ORDER BY (tenant_id, event_timestamp)
TTL event_timestamp + INTERVAL 30 DAY" >/dev/null || true
else
  echo "[ch][warn] ClickHouse not reachable on :8123. Start it first (brew services start clickhouse)" >&2
fi

# 3) API
(
  cd siem_unified_pipeline
  cargo build --release --bin siem-pipeline >/dev/null
)
nohup ./siem_unified_pipeline/target/release/siem-pipeline > "$ART/api.log" 2>&1 & echo $! > "$ART/api.pid"
for i in {1..30}; do curl -fsS http://127.0.0.1:9999/api/v2/health >/dev/null && break; sleep 1; done
curl -fsS http://127.0.0.1:9999/api/v2/health | tee "$ART/health.json" >/dev/null

# 4) UI (preview on 5173, base /ui/app)
(
  cd siem_unified_pipeline/ui-react
  npm ci >/dev/null
  VITE_API_URL='http://127.0.0.1:9999' npm run build >/dev/null
)
nohup bash -lc "cd siem_unified_pipeline/ui-react && npm run preview -- --strictPort --port 5173" > "$ART/ui.log" 2>&1 & echo $! > "$ART/ui.pid"
for i in {1..30}; do curl -fsS http://127.0.0.1:5173/ui/app/ >/dev/null && break; sleep 1; done

# 5) Smokes
if [ -x scripts/wiring_smoke.sh ]; then
  bash scripts/wiring_smoke.sh || true
fi

echo "All up. UI: http://127.0.0.1:5173/ui/app/"
