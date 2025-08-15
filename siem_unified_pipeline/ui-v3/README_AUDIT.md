# UI Action Audit System

> **UI-V3 View (Action Audit)** [[memory:6316222]]

Comprehensive three-layer audit system to ensure every UI element is properly wired and tested.

## Quick Start

```bash
# One-time setup
./scripts/setup-audit-system.sh

# Run complete audit
npm run audit:full

# View detailed report
open action-audit-simple.md
```

## 🎯 What This System Does

1. **🔍 Static Scan** - Finds missing handlers, no-op functions, missing metadata
2. **⚠️ Runtime Guard** - Warns in development about unwired elements  
3. **🧪 E2E Verification** - Tests UI actions work with real backend calls

## 📊 Current Status

After running the audit, we found **134 issues** that need attention:

### Top Issues
- **Missing handlers**: Buttons without onClick/onSelect/href
- **Missing metadata**: Elements without `data-action` attributes
- **Direct HTTP calls**: Should use `lib/http.ts` instead
- **TODO comments**: Unfinished functionality

## 🔧 How to Fix Issues

### 1. Replace Button with ActionButton

**Before:**
```tsx
<Button variant="outline">Save</Button>
```

**After:**
```tsx
import { ActionButton } from "@/components/ui/ActionButton";

<ActionButton 
  data-action="settings:profile:save"
  data-intent="api"
  data-endpoint="/api/v2/user/profile"
  onClick={handleSave}
  variant="outline"
>
  Save
</ActionButton>
```

### 2. Replace DropdownMenuItem with ActionMenuItem

**Before:**
```tsx
<DropdownMenuItem>Delete</DropdownMenuItem>
```

**After:**
```tsx
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";

<ActionMenuItem 
  data-action="rules:item:delete"
  data-intent="api"
  data-endpoint="/api/v2/rules"
  data-danger="true"
  onSelect={handleDelete}
>
  Delete
</ActionMenuItem>
```

## 📋 Action Metadata Convention

Every actionable element needs:

```tsx
data-action="page:feature:verb"          // Required: unique ID
data-intent="api|navigate|open-modal|submit"  // Required: action type
data-endpoint="/api/v2/endpoint"         // Required if intent="api"
data-danger="true"                       // Optional: skip in e2e tests
```

## 🚀 Available Commands

```bash
npm run audit:grep      # Pattern detection (fast)
npm run audit:actions   # Static analysis (detailed)
npm run audit:full      # Both audits
npm run cypress:open    # E2E test UI
npm run cypress:run     # E2E test headless
npm run test:actions    # Complete audit + E2E
```

## 📁 Key Files

```
scripts/
├── audit-actions-simple.js   # Static analysis
├── grep-sweeps.sh            # Pattern detection  
└── setup-audit-system.sh     # One-time setup

src/components/ui/
├── ActionButton.tsx          # Button wrapper with validation
└── ActionMenuItem.tsx        # MenuItem wrapper with validation

cypress/
├── e2e/actions-wire.cy.ts    # E2E verification tests
└── support/e2e.ts           # Test utilities

docs/
└── UI_ACTION_AUDIT_SYSTEM.md # Complete documentation
```

## 📊 Reports Generated

- `action-audit-simple.json` - Machine-readable results
- `action-audit-simple.md` - Human-readable report with examples

## 🎯 Goals

- [ ] **Zero dead buttons** - Every interactive element works
- [ ] **Complete auditability** - All actions have metadata for testing
- [ ] **Runtime safety** - Development warnings catch issues early
- [ ] **E2E confidence** - Automated verification with real backend

## 🔄 Integration

### Pre-commit Hook
```bash
#!/bin/sh
npm run audit:full || exit 1
```

### CI/CD Pipeline  
```yaml
- name: UI Action Audit
  run: npm run test:actions
```

## 📚 Documentation

- **[Complete Guide](docs/UI_ACTION_AUDIT_SYSTEM.md)** - Detailed documentation
- **[UI Architecture Rules](../README.md)** - Overall UI guidelines [[memory:6316219]]

---

**Next Step**: Run `npm run audit:full` and start fixing the top 5 issues first!
