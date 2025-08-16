#!/bin/bash
set -euo pipefail

echo "🎨 Running bulk fix for common hardcoded color patterns..."

# Common text color patterns
echo "📝 Fixing text colors..."
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' \
  -e 's/text-slate-900 dark:text-white/text-foreground/g' \
  -e 's/text-slate-600 dark:text-slate-400/text-muted-foreground/g' \
  -e 's/text-slate-500 dark:text-slate-400/text-muted-foreground/g' \
  -e 's/text-slate-400/text-muted-foreground/g' \
  -e 's/text-slate-500/text-muted-foreground/g'

# Common background patterns
echo "🎨 Fixing background colors..."
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' \
  -e 's/bg-white dark:bg-slate-800/bg-card/g' \
  -e 's/bg-white dark:bg-slate-900/bg-card/g' \
  -e 's/bg-slate-50 dark:bg-slate-800/bg-muted/g' \
  -e 's/bg-slate-50 dark:bg-slate-900/bg-background/g'

# Common border patterns
echo "🔲 Fixing border colors..."
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' \
  -e 's/border-slate-200 dark:border-slate-700/border-border/g' \
  -e 's/border-slate-200 dark:border-slate-600/border-border/g' \
  -e 's/border border-slate-200 dark:border-slate-700/border border-border/g'

# Gray color patterns (for status badges)
echo "🏷️ Fixing gray status colors..."
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' \
  -e 's/bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-800/bg-muted text-muted-foreground border-border/g'

echo "✅ Bulk color fixes completed!"
echo "📊 Summary of changes:"
echo "  - Text colors: slate-900/white → text-foreground"
echo "  - Muted text: slate-600/400 → text-muted-foreground"
echo "  - Backgrounds: white/slate → bg-card/bg-muted"
echo "  - Borders: slate-200/700 → border-border"
echo "  - Gray status: gray variants → muted variants"
