# 🎨 Global Design System Implementation

## Overview
Complete centralized UI token system for consistent styling across the entire SIEM application.

## ✅ What's Implemented

### 1. **Central Design Tokens** (`src/styles/tokens.css`)
- **Semantic Colors**: All shadcn-compatible HSL tokens for light/dark themes
- **Global Sizing**: Control heights, padding, font sizes via CSS variables
- **Table Tokens**: Dedicated tokens for table components
- **Shadows**: Consistent elevation system
- **SIEM Tokens**: Severity levels and status indicators

### 2. **Tailwind Integration** (`tailwind.config.ts`)
- **Border Radius**: All `rounded-*` classes map to `--radius` token
- **Box Shadows**: `shadow-sm/md` map to `--shadow-*` tokens
- **Semantic Colors**: Complete color system using CSS variables

### 3. **Component Refactoring**
- **Button**: Uses `--control-h-*`, `--control-px-*`, `--radius` tokens
- **Input**: Height, padding, radius from tokens
- **Select**: Trigger and content use token system
- **All UI Components**: Consistent token-based styling

### 4. **ESLint Protection** (`eslint.config.mjs`)
Prevents regression with rules that block:
- Hardcoded `rounded-*`, `h-*`, `px-*` classes
- Hex colors (`#ffffff`)
- Palette colors (`bg-slate-500`, `text-blue-600`)

## 🎯 How To Use

### **Change Global Radius** (affects ALL components)
```css
/* src/styles/tokens.css */
:root {
  --radius: 1rem;     /* More rounded */
  --radius: 0.25rem;  /* Sharp corners */
}
```

### **Change All Button/Input Sizes**
```css
:root {
  --control-h-md: 3rem;      /* Taller controls */
  --control-px-md: 1.5rem;   /* More padding */
  --control-fs-md: 1rem;     /* Larger text */
}
```

### **Change All Colors** (light/dark modes)
```css
:root {
  --primary: 200 100% 50%;    /* Blue theme */
}
.dark {
  --primary: 200 100% 60%;    /* Lighter in dark mode */
}
```

### **Change Severity Colors**
```css
:root {
  --sev-critical: 0 100% 70%;  /* Brighter red */
  --sev-high: 30 100% 60%;     /* Orange instead of red */
}
```

## 🚫 What's Banned

ESLint will error on:
```tsx
// ❌ BAD - Hardcoded values
<Button className="h-8 px-4 rounded-lg bg-red-500" />

// ✅ GOOD - Semantic tokens
<Button size="sm" variant="destructive" />
```

## 📁 File Structure

```
src/
├── styles/
│   ├── tokens.css           # 🎯 Central tokens (edit here!)
│   └── radius-examples.md   # Examples & docs
├── components/ui/           # 🔧 Token-consuming components
├── app/globals.css          # 📥 Imports tokens.css
└── tailwind.config.ts       # 🔗 Maps tokens to Tailwind
```

## 🧪 Testing Token Changes

1. **Edit** `--radius` in `tokens.css`
2. **Refresh** any page
3. **Verify** all buttons, inputs, cards use new radius
4. **Revert** the change

## 🔄 Migration Complete

- ✅ Centralized tokens created
- ✅ Tailwind config updated
- ✅ Core components refactored
- ✅ ESLint guards in place
- ✅ Documentation complete

**Result**: Change one token → entire app updates! 🎉
