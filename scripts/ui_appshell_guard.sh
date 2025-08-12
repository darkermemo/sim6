#!/usr/bin/env bash
set -euo pipefail

# Config (override via env)
START_SHA="${START_SHA:-}"
END_REF="${END_REF:-HEAD}"
UI_ROOT="siem_unified_pipeline/ui-react"
PAGES_DIR="$UI_ROOT/src/pages"
ROUTES_FILE="$UI_ROOT/src/routes.tsx"       # our current router file
LEGACY_DIR="siem_unified_pipeline/ui"       # legacy UI path
SIG_IMPORT_PATH="${SIG_IMPORT_PATH:-@/components/layout/AppShell}"  # canonical import
SIG_TAG_NAME="${SIG_TAG_NAME:-AppShell}"    # component tag we expect in routes

ART="target/test-artifacts"
OUT_JSONL="$ART/ui_appshell_scan.jsonl"
OUT_SUMMARY="$ART/ui_appshell_scan_summary.txt"
mkdir -p "$ART"
: > "$OUT_JSONL"
: > "$OUT_SUMMARY"

if [[ -z "$START_SHA" ]]; then
  echo "START_SHA not set. Pick a base (e.g. the last known-good UI commit)."
  echo "Usage: START_SHA=<sha> scripts/ui_appshell_guard.sh"
  exit 2
fi

range="${START_SHA}..${END_REF}"

echo "[guard] scanning commits: $range" | tee -a "$OUT_SUMMARY"

COMMITS=$(git rev-list --reverse "$range") || true
if [[ -z "${COMMITS:-}" ]]; then
  echo "[guard] no commits in range $range" | tee -a "$OUT_SUMMARY"
  exit 0
fi

# Helpers
show_file() { # $1=sha $2=path
  git show "$1:$2" 2>/dev/null || true
}
has_file() { # $1=sha $2=path
  git cat-file -e "$1:$2" 2>/dev/null
}

for sha in $COMMITS; do
  # list changed files
  changed=$(git diff-tree --no-commit-id --name-status -r "$sha" | awk '{print $2}')
  # filter
  changed_pages="$(printf '%s\n' $changed | grep -E "^${PAGES_DIR}/.*\.tsx$" || true)"
  changed_legacy="$(printf '%s\n' $changed | grep -E "^${LEGACY_DIR}/" || true)"

  # routes presence & signature checks in this commit
  routes_present=0
  appshell_import=0
  appshell_used=0
  if has_file "$sha" "$ROUTES_FILE"; then
    routes_present=1
    rf="$(show_file "$sha" "$ROUTES_FILE")"
    grep -qE "from ['\"]${SIG_IMPORT_PATH}['\"]" <<<"$rf" && appshell_import=1 || appshell_import=0
    grep -qE "<${SIG_TAG_NAME}(\\s|>)" <<<"$rf" && appshell_used=1 || appshell_used=0
  fi

  # per-page linkage: if the page basename appears in routes import/JSX
  page_reports=()
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    base="$(basename "$f" .tsx)"
    under_routes=0
    if [[ $routes_present -eq 1 ]]; then
      grep -qE "(from\\s+|import\\s+).*${base}" <<<"$rf" && under_routes=1 || {
        # also check route path usage (string reference)
        grep -qE "[\"\']/${base}[\"\']" <<<"$rf" && under_routes=1 || true
      }
    fi
    page_reports+=("{\"file\":\"$f\",\"page\":\"$base\",\"linked_in_routes\":$under_routes}")
  done <<< "$changed_pages"

  # legacy changes flag
  if [[ -n "$changed_legacy" ]]; then legacy_touched=1; else legacy_touched=0; fi

  # write JSONL
  jq -cn --arg sha "$sha" \
    --arg routes "$ROUTES_FILE" \
    --arg import_path "$SIG_IMPORT_PATH" \
    --arg tag "$SIG_TAG_NAME" \
    --argjson routes_present $routes_present \
    --argjson appshell_import $appshell_import \
    --argjson appshell_used $appshell_used \
    --argjson legacy_touched $legacy_touched \
    --argjson pages "$(printf '%s\n' "${page_reports[@]}" | jq -s '.')" \
    '{
      commit:$sha,
      routes_file:$routes,
      appshell:{
        import_path:$import_path,
        tag:$tag,
        routes_present:$routes_present,
        import_found:$appshell_import,
        tag_found:$appshell_used
      },
      legacy_touched:$legacy_touched,
      pages:$pages
    }' >> "$OUT_JSONL"

  # human summary
  {
    echo "─"
    echo "commit: $sha"
    if [[ $legacy_touched -eq 1 ]]; then
      echo "  ⚠ legacy UI modified: files under $LEGACY_DIR changed"
    fi
    if [[ -n "$changed_pages" ]]; then
      echo "  pages changed:"
      for f in "${changed_pages[@]}"; do echo "    - $f"; done
      if [[ $routes_present -eq 0 ]]; then
        echo "  ❌ routes file missing in this commit: $ROUTES_FILE"
      else
        [[ $appshell_import -eq 1 ]] && echo "  ✅ routes import AppShell from $SIG_IMPORT_PATH" || echo "  ❌ routes missing AppShell import"
        [[ $appshell_used -eq 1 ]] && echo "  ✅ routes use <${SIG_TAG_NAME}> in JSX tree" || echo "  ❌ routes missing <${SIG_TAG_NAME}> usage"
        # page linkage summary
        for jr in "${page_reports[@]}"; do
          page="$(jq -r '.page' <<<"$jr")"
          linked="$(jq -r '.linked_in_routes' <<<"$jr")"
          [[ "$linked" = "1" ]] && echo "  ✅ page linked in routes: $page" || echo "  ❌ page NOT linked in routes: $page"
        done
      fi
    else
      echo "  (no ui-react pages changed)"
    fi
  } >> "$OUT_SUMMARY"

done

echo "[guard] results:"
echo "  - JSONL: $OUT_JSONL"
echo "  - Summary: $OUT_SUMMARY"


