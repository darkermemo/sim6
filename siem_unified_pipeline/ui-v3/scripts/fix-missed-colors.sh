#!/bin/bash
set -euo pipefail

echo "🔧 Fixing missed color patterns from bulk script..."

# Fix status indicator backgrounds (green/blue with dark variants)
echo "📝 Fixing status indicator backgrounds..."
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' \
  -e 's/bg-green-100 dark:bg-green-900/bg-green-100\/10 dark:bg-green-500\/10/g' \
  -e 's/bg-blue-100 dark:bg-blue-900/bg-blue-100\/10 dark:bg-blue-500\/10/g' \
  -e 's/bg-green-50 dark:bg-green-900/bg-green-50\/50 dark:bg-green-500\/10/g' \
  -e 's/border-green-200 dark:border-green-800/border-green-200\/50 dark:border-green-500\/20/g'

# Actually, let's use proper theme tokens instead of opacity
echo "🎨 Converting to proper theme tokens..."
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i '' \
  -e 's/bg-green-100\/10 dark:bg-green-500\/10/bg-muted/g' \
  -e 's/bg-blue-100\/10 dark:bg-blue-500\/10/bg-muted/g' \
  -e 's/bg-green-50\/50 dark:bg-green-500\/10/bg-muted/g' \
  -e 's/border-green-200\/50 dark:border-green-500\/20/border-border/g'

echo "✅ Fixed missed color patterns!"
