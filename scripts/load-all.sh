#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/target/generated"
BIN="$ROOT/siem_tools/target/debug/siem"
TABLE=${TABLE:-dev.events}
if [[ ! -x "$BIN" ]]; then (cd "$ROOT/siem_tools" && cargo build -q --bin siem); fi
shopt -s nullglob
for f in "$OUT_DIR"/*.ndjson; do
  echo "Loading $f -> $TABLE"
  "$BIN" load-ch --file "$f" --table "$TABLE"
done
