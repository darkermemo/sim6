#!/bin/bash
set -euo pipefail

echo "🔍 Checking for transparency/opacity classes and hardcoded colors..."

# Check for transparency/opacity
if rg -n "(bg-[a-z0-9-]+\/\d+|text-[a-z0-9-]+\/\d+|border-[a-z0-9-]+\/\d+|opacity-\d+|backdrop-blur|bg-transparent)" src | grep -v -E "(hover:bg-[a-z-]+\/[0-9]+|disabled:opacity-[0-9]+|hover:opacity-[0-9]+|group-hover:opacity-[0-9]+|focus:bg-[a-z-]+|data-\[state=open\]:bg-[a-z-]+|data-\[disabled\]:opacity-[0-9]+|bg-black\/60)"; then
  echo "❌ Found translucent classes - UI must be solid-only!"
  echo "Note: Hover states and disabled opacity are allowed"
  exit 1
fi

# Check for hardcoded slate/gray colors (allow explicit solid colors for modals)
# We allow explicit slate colors when used for solid modal/dialog styling
if rg -n "(bg-slate-|text-slate-|border-slate-|bg-gray-|text-gray-|border-gray-)" src -g "*.tsx" -g "*.ts" | grep -v -E "(bg-white dark:bg-slate-900|bg-slate-50 dark:bg-slate-800|bg-slate-100 dark:bg-slate-800|bg-slate-200 dark:bg-slate-700|border-slate-200 dark:border-slate-700|text-slate-900 dark:text-slate-100|hover:bg-slate-100 dark:hover:bg-slate-700|data-\[state=open\]:bg-slate-100 dark:data-\[state=open\]:bg-slate-800|focus:bg-slate-100 dark:focus:bg-slate-800|focus:text-slate-900 dark:focus:text-slate-100)" | head -5; then
  echo "❌ Found problematic hardcoded slate/gray colors"
  echo "Note: Explicit solid slate colors for modals are allowed"
  exit 1
fi

# Check for inline styles (allow specific dynamic styles for charts/progress/sidebar)
if rg -n "style=\{" src -g "*.tsx" -g "*.ts" | grep -v -E "(height.*%|width.*%|--progress-|--bar-|--sidebar-|chart\.tsx|sidebar\.tsx)" | head -5; then
  echo "❌ Found problematic inline styles - use CSS custom properties instead"
  echo "Note: Dynamic styles for charts, progress bars, and sidebar are allowed"
  exit 1
fi

echo "✅ Solid-only passed - no transparency, hardcoded colors, or inline styles detected"
exit 0
