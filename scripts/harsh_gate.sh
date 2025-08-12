#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

ART="target/harsh-gate"
mkdir -p "$ART"

echo "== WORLD-SIEM HARSH GATE =="

# -------- 0) Tripwires: no legacy paths, no mixed trees --------
echo "[tripwire] scanning for legacy UI paths…"
if grep -R --line-number "siem_unified_pipeline/ui[^-r]" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=target --exclude-dir=scripts >/dev/null 2>&1; then
  echo "FAIL: Found references to legacy UI path siem_unified_pipeline/ui (non -react)."
  grep -R --line-number "siem_unified_pipeline/ui[^-r]" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=target --exclude-dir=scripts | tee "$ART/legacy_refs.txt"
  exit 1
fi

# -------- 1) AppShell guard on all pages --------
echo "[appshell] enforcing AppShell wrapping + import in routes.tsx…"
: "${SIG_IMPORT_PATH:="@/components/layout/AppShell"}"
: "${SIG_TAG_NAME:="AppShell"}"
if [ -x scripts/ui_appshell_guard.sh ]; then
  START_SHA="${START_SHA:-802d220}" SIG_IMPORT_PATH="$SIG_IMPORT_PATH" SIG_TAG_NAME="$SIG_TAG_NAME" \
    scripts/ui_appshell_guard.sh | tee "$ART/ui_appshell_guard.out"
else
  echo "FAIL: scripts/ui_appshell_guard.sh missing."
  exit 2
fi

# -------- 2) Required pages present (new UI only) --------
echo "[pages] verifying required pages exist in ui-react…"
REQPAGES=(
  "siem_unified_pipeline/ui-react/src/pages/Search.tsx"
  "siem_unified_pipeline/ui-react/src/pages/Alerts.tsx"
  "siem_unified_pipeline/ui-react/src/pages/Rules.tsx"
  "siem_unified_pipeline/ui-react/src/pages/RulePacks.tsx"
)
MISSING=0
for p in "${REQPAGES[@]}"; do
  if [ ! -f "$p" ]; then echo "MISSING $p" | tee -a "$ART/missing_pages.txt"; MISSING=1; fi
done
[ $MISSING -eq 0 ] || { echo "FAIL: required pages missing."; exit 3; }

# -------- 3) TypeScript + ESLint on ui-react only --------
echo "[tsc] type-checking ui-react…"
( cd siem_unified_pipeline/ui-react && npx tsc -p tsconfig.app.json --noEmit ) 2>&1 | tee "$ART/tsc_ui.out"
if [ "${PIPESTATUS[0]}" -ne 0 ]; then echo "FAIL: TypeScript errors."; exit 4; fi

if [ -f "siem_unified_pipeline/ui-react/package.json" ] && jq -e '.scripts.lint' siem_unified_pipeline/ui-react/package.json >/dev/null 2>&1; then
  echo "[eslint] linting ui-react with zero warnings…"
  ( cd siem_unified_pipeline/ui-react && npm run -s lint -- --max-warnings=0 ) 2>&1 | tee "$ART/eslint_ui.out" || { echo "FAIL: ESLint errors."; exit 5; }
else
  echo "[eslint] WARN: no lint script; skipping"
fi

# -------- 4) UI build + bundle budgets --------
echo "[build] vite build (ui-react)…"
( cd siem_unified_pipeline/ui-react && npm run -s build ) | tee "$ART/vite_build.out"
DIST="siem_unified_pipeline/ui-react/dist"
[ -d "$DIST" ] || { echo "FAIL: dist/ missing."; exit 6; }

echo "[budget] computing gzipped JS size…"
GZ_SUM=$(find "$DIST/assets" -type f -name "*.js" -print0 | xargs -0 -I{} sh -c 'gzip -c "{}" | wc -c' | awk '{s+=$1} END{print s+0}')
CAP=$((220 * 1024))  # 220 KiB total gz
echo "gzipped js total = ${GZ_SUM} bytes (cap ${CAP})" | tee "$ART/bundle_budget.txt"
if [ "$GZ_SUM" -gt "$CAP" ]; then
  echo "FAIL: bundle gz size over budget."
  exit 7
fi

# -------- 5) API: build + health + contracts --------
echo "[api] building release binary…"
( cd siem_unified_pipeline && cargo build --release --bin siem-pipeline ) | tee "$ART/api_build.out"

echo "[api] starting…"
pkill -f siem-pipeline >/dev/null 2>&1 || true
nohup ./siem_unified_pipeline/target/release/siem-pipeline > "$ART/api.log" 2>&1 & echo $! > "$ART/api.pid"
for i in {1..60}; do curl -fsS http://127.0.0.1:9999/api/v2/health >/dev/null && break; sleep 1; done
curl -fsS http://127.0.0.1:9999/api/v2/health | tee "$ART/health.json" >/dev/null

echo "[api-contract] compile/execute smoke…"
echo '{"tenant_id":"default","time":{"last_seconds":600},"q":"message:hello"}' > "$ART/compile_body.json"
echo '{"tenant_id":"default","time":{"last_seconds":600},"q":"message:hello","limit":5}' > "$ART/execute_body.json"
curl -fsS -X POST http://127.0.0.1:9999/api/v2/search/compile -H 'content-type: application/json' --data-binary @"$ART/compile_body.json" | tee "$ART/compile.json" >/dev/null
curl -fsS -X POST http://127.0.0.1:9999/api/v2/search/execute -H 'content-type: application/json' --data-binary @"$ART/execute_body.json" | tee "$ART/execute.json" >/dev/null

jq -e '.sql' "$ART/compile.json" >/dev/null || { echo "FAIL: compile contract shape."; exit 8; }
jq -e '.data.meta' "$ART/execute.json" >/dev/null || { echo "FAIL: execute contract shape."; exit 8; }

# -------- 6) UI preview + E2E (Playwright) --------
echo "[ui] starting preview (5173)…"
pkill -f "vite|preview" >/dev/null 2>&1 || true
nohup bash -lc "cd siem_unified_pipeline/ui-react && npm run -s preview -- --strictPort --port 5173" > "$ART/ui.log" 2>&1 & echo $! > "$ART/ui.pid"
for i in {1..60}; do curl -fsS http://127.0.0.1:5173/ui/app/ >/dev/null && break; sleep 1; done

if [ -f siem_unified_pipeline/ui-react/playwright.config.ts ] || [ -f siem_unified_pipeline/ui-react/playwright.config.js ]; then
  echo "[e2e] running Playwright…"
  ( cd siem_unified_pipeline/ui-react && npx playwright install --with-deps >/dev/null 2>&1 || true; E2E_BASE_URL="http://127.0.0.1:5173/ui/app" npx -y @playwright/test test --reporter=list ) 2>&1 | tee "$ART/e2e.out"
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then echo "FAIL: E2E regressions."; exit 9; fi
else
  echo "[e2e] WARN: no Playwright config found; skipping"
fi

# -------- 7) Inventory sanity (UI components imported by pages exist) --------
echo "[inventory] verifying components imported by key pages exist…"
MISS=0
for P in "${REQPAGES[@]}"; do
  grep -Eo "from ['\"][^'\"]+['\"]" "$P" | sed -E "s/^from ['\"](.*)['\"]/\1/" | while read -r m; do
    [[ "$m" =~ ^(@|\.|/) ]] || continue
    if [[ "$m" == @/* ]]; then
      PATH_REL="siem_unified_pipeline/ui-react/src/${m#@/}"
    elif [[ "$m" == ./* || "$m" == ../* ]]; then
      DIR="$(dirname "$P")"; PATH_REL="$DIR/$m"
    else
      continue
    fi
    if [ -f "$PATH_REL" ] || [ -f "${PATH_REL}.ts" ] || [ -f "${PATH_REL}.tsx" ] || [ -f "${PATH_REL}/index.tsx" ] || [ -f "${PATH_REL}/index.ts" ]; then
      :
    else
      echo "MISSING_IMPORT $P -> $m (resolved $PATH_REL)" | tee -a "$ART/missing_imports.txt"
      MISS=1
    fi
  done
done
[ $MISS -eq 0 ] || { echo "FAIL: missing UI imports."; exit 10; }

echo "== PASS: ALL GATES GREEN =="
echo "Artifacts => $ART"


