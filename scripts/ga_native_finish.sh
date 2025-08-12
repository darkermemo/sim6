#!/usr/bin/env bash
set -Eeuo pipefail

BASE=/Users/yasseralmohammed/sim6
API_BIN="$BASE/siem_unified_pipeline/target/release/siem-pipeline"
RUN_BIN="$BASE/siem_unified_pipeline/target/release/siem-stream-runner"
ART_DIR="$BASE/siem_unified_pipeline/target/test-artifacts"
mkdir -p "$ART_DIR"

echo "[ga] build release bins"
cd "$BASE/siem_unified_pipeline"
cargo build --release --bins

echo "[ga] create launchd plists"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$HOME/Library/LaunchAgents/com.siem.pipeline.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.siem.pipeline</string>
  <key>ProgramArguments</key>
  <array>
    <string>${API_BIN}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>RUST_LOG</key><string>info</string>
    <key>CLICKHOUSE_URL</key><string>http://127.0.0.1:8123</string>
    <key>CLICKHOUSE_DATABASE</key><string>dev</string>
    <key>REDIS_URL</key><string>redis://127.0.0.1:6379</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/siem_srv.log</string>
  <key>StandardErrorPath</key><string>/tmp/siem_srv.err</string>
</dict></plist>
PL

cat > "$HOME/Library/LaunchAgents/com.siem.streamrunner.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.siem.streamrunner</string>
  <key>ProgramArguments</key>
  <array>
    <string>${RUN_BIN}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>RUST_LOG</key><string>info</string>
    <key>CLICKHOUSE_URL</key><string>http://127.0.0.1:8123</string>
    <key>CLICKHOUSE_DATABASE</key><string>dev</string>
    <key>REDIS_URL</key><string>redis://127.0.0.1:6379</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/siem_runner.log</string>
  <key>StandardErrorPath</key><string>/tmp/siem_runner.err</string>
</dict></plist>
PL

echo "[ga] (re)load agents"
launchctl unload "$HOME/Library/LaunchAgents/com.siem.pipeline.plist" 2>/dev/null || true
launchctl load   "$HOME/Library/LaunchAgents/com.siem.pipeline.plist"
launchctl unload "$HOME/Library/LaunchAgents/com.siem.streamrunner.plist" 2>/dev/null || true
launchctl load   "$HOME/Library/LaunchAgents/com.siem.streamrunner.plist"
launchctl list | grep com.siem || true

echo "[ga] package dist"
cd "$BASE/siem_unified_pipeline"
rm -rf dist && mkdir -p dist/bin dist/scripts dist/ui
cp -a target/release/siem-pipeline target/release/siem-stream-runner dist/bin/
cp -a ../scripts/*.sh dist/scripts/
cp -a ui dist/ui
date -u +%FT%TZ > dist/VERSION
(cd dist && tar -czf ../siem-v2-native-macos.tgz .)
ls -lh "$BASE/siem_unified_pipeline/siem-v2-native-macos.tgz"

echo "[ga] verify health + streaming smoke"
curl -fsS http://127.0.0.1:9999/health -o "$ART_DIR/ga_health.json"
bash "$BASE/scripts/stream_smoke.sh"

echo "[ga] append GA stamp"
ts=$(date -u +%FT%TZ)
OUT="$ART_DIR/final_reportv1.md"
{
  echo; echo "## GA Native Stamp — $ts"; echo;
  echo "Binaries: siem-pipeline, siem-stream-runner (launchd loaded)"; echo;
  echo "**Artifacts:**"; echo '```txt'; ls -1 "$ART_DIR"; echo '```';
} >> "$OUT"
tail -n 80 "$OUT" || true

