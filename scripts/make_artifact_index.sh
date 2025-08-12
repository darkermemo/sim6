#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
INDEX="$ART/artifacts-index.md"

cd "$ART" 2>/dev/null || exit 0

echo "# Artifact Index" > "$INDEX"
echo >> "$INDEX"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$INDEX"
echo >> "$INDEX"
echo "## Files" >> "$INDEX"

for f in *.json *.txt *.log *.tsv *.sql; do
    [ -f "$f" ] || continue
    SIZE=$(wc -c < "$f" | tr -d ' ')
    echo "- $f (${SIZE} bytes)" >> "$INDEX"
done

echo >> "$INDEX"
echo "## Summary" >> "$INDEX"
if [ -f "full_ms_summary.txt" ]; then
    echo '```' >> "$INDEX"
    cat full_ms_summary.txt >> "$INDEX"
    echo '```' >> "$INDEX"
fi
