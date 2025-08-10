#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/target/generated"
mkdir -p "$OUT_DIR"
BIN="$ROOT/siem_tools/target/debug/siem"
if [[ ! -x "$BIN" ]]; then (cd "$ROOT/siem_tools" && cargo build -q --bin siem); fi
seed=${SEED:-42}
count=${COUNT:-200}
tenant=${TENANT:-default}
run() { src="$1"; "$BIN" gen "$src" --seed "$seed" --count "$count" --tenant "$tenant" --out "$OUT_DIR/${src}.raw" --out-ndjson "$OUT_DIR/${src}.ndjson"; }
run okta-system-log
run gcp-audit
run zeek-http
run zeek-dns || true
run windows-security || true
run sysmon || true
run pan-os || true
run fortigate || true
run otel-logs || true
