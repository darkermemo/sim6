#!/bin/bash
set -euo pipefail

echo "🎯 BULK FIX: Making ALL modals/dialogs SOLID"
echo "Using the successful Filter Builder Dialog pattern..."
echo ""

# 1. Fix the centralized Modal component (most important!)
echo "📝 1. Fixing centralized Modal component..."
sed -i '' \
  -e 's/bg-background flex items-center justify-center p-4 z-50/bg-black flex items-center justify-center p-4 z-50/g' \
  -e 's/bg-card text-card-foreground border border-border/bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-2 border-slate-200 dark:border-slate-700/g' \
  -e 's/border-b border-border/border-b border-slate-200 dark:border-slate-700/g' \
  src/components/ui/modal.tsx

# 2. Fix Sheet component (mobile navigation)
echo "📝 2. Fixing Sheet component..."
sed -i '' \
  -e 's/bg-background data-\[state=open\]:animate-in/bg-white dark:bg-slate-900 data-[state=open]:animate-in/g' \
  -e 's/data-\[state=open\]:bg-secondary/data-[state=open]:bg-slate-100 dark:data-[state=open]:bg-slate-800/g' \
  src/components/ui/sheet.tsx

# 3. Fix any remaining bg-card, bg-muted, bg-background in components
echo "📝 3. Fixing remaining theme-based backgrounds..."
find src/components -name "*.tsx" -exec sed -i '' \
  -e 's/className="[^"]*bg-card[^"]*"/className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700"/g' \
  -e 's/bg-muted/bg-slate-100 dark:bg-slate-800/g' \
  -e 's/hover:bg-muted/hover:bg-slate-100 dark:hover:bg-slate-700/g' \
  {} \;

# 4. Fix any remaining bg-background overlays
echo "📝 4. Fixing overlay backgrounds..."
find src -name "*.tsx" -exec sed -i '' \
  -e 's/fixed inset-0.*bg-background/fixed inset-0 bg-black/g' \
  -e 's/bg-background\/95/bg-black/g' \
  -e 's/bg-background\/90/bg-black/g' \
  -e 's/bg-background\/80/bg-black/g' \
  {} \;

# 5. Fix border colors to be consistent
echo "📝 5. Fixing border colors..."
find src -name "*.tsx" -exec sed -i '' \
  -e 's/border-border/border-slate-200 dark:border-slate-700/g' \
  {} \;

echo ""
echo "✅ BULK FIX COMPLETE!"
echo "📊 Applied the Filter Builder Dialog pattern to:"
echo "   ✅ Centralized Modal component"
echo "   ✅ Sheet component (mobile navigation)"
echo "   ✅ All remaining bg-card → bg-white dark:bg-slate-900"
echo "   ✅ All remaining bg-muted → bg-slate-100 dark:bg-slate-800"
echo "   ✅ All overlay backgrounds → bg-black"
echo "   ✅ All borders → border-slate-200 dark:border-slate-700"
echo ""
echo "🎉 ALL MODALS/DIALOGS SHOULD NOW BE SOLID!"
