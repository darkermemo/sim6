#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Finding and fixing hardcoded styles..."

# Fix hardcoded heights
echo "Fixing hardcoded heights..."
find src -name "*.tsx" -exec sed -i '' 's/h-8 /h-[var(--control-h-sm)] /g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/h-9 /h-[var(--control-h-md)] /g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/h-10 /h-[var(--control-h-lg)] /g' {} \;

# Fix hardcoded padding
echo "Fixing hardcoded padding..."
find src -name "*.tsx" -exec sed -i '' 's/px-2 /px-[var(--control-px-sm)] /g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/px-3 /px-[var(--control-px-md)] /g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/px-4 /px-[var(--control-px-lg)] /g' {} \;

# Fix slate colors to semantic tokens
echo "Fixing slate colors..."
find src -name "*.tsx" -exec sed -i '' 's/text-slate-900 dark:text-white/text-foreground/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/text-slate-600 dark:text-slate-400/text-muted-foreground/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/text-slate-500 dark:text-slate-400/text-muted-foreground/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/text-slate-400/text-muted-foreground/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/bg-slate-50 dark:bg-slate-900/bg-background/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/bg-slate-100 dark:bg-slate-800/bg-muted/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/border-slate-200 dark:border-slate-700/border-border/g' {} \;

# Fix rounded classes
echo "Fixing rounded classes..."
find src -name "*.tsx" -exec sed -i '' 's/rounded-2xl/rounded-xl/g' {} \;

echo "✅ Hardcoded styles fixed!"
echo ""
echo "🔍 Remaining hardcoded patterns:"
echo "Heights:"
find src -name "*.tsx" | xargs grep -n "h-[0-9]" | head -3 || echo "None found"
echo "Slate colors:"
find src -name "*.tsx" | xargs grep -n "slate-" | head -3 || echo "None found"
echo "Hardcoded rounded:"
find src -name "*.tsx" | xargs grep -n "rounded-[0-9]" | head -3 || echo "None found"
