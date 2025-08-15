# UI Action Audit System

## Overview [[memory:6316222]]

This comprehensive UI action audit system ensures every actionable UI element is properly wired, tested, and auditable. It provides a three-layer verification approach: static scan → runtime guard → e2e verification.

## 🎯 Goals

- **Zero dead buttons**: Every interactive element must have a working handler
- **Complete auditability**: Track all user actions for testing and analytics  
- **Development safety**: Catch missing handlers during development
- **E2E verification**: Prove UI actions work with real backend calls

## 📁 System Components

### 1. Static Analysis Tools

#### A. Grep-based Pattern Detection (`scripts/grep-sweeps.sh`)
Fast regex-based detection of common anti-patterns:

```bash
npm run audit:grep
```

**What it finds:**
- Empty click handlers `onClick={() => {}}`
- Buttons without handlers/navigation/submit
- Dropdown items missing onSelect/onClick
- Missing action metadata (`data-action`)
- Direct HTTP calls (should use `lib/http.ts`)
- TODO/FIXME comments
- Console logs in production code
- Hardcoded URLs

#### B. AST-based Deep Analysis (`scripts/audit-actions-simple.js`)
More sophisticated analysis of JSX structure:

```bash
npm run audit:actions
```

**What it finds:**
- Missing handlers on actionable elements
- No-op/empty handlers
- Missing `data-action` attributes
- `data-intent="api"` without `data-endpoint`

### 2. Runtime Guards (Development)

#### ActionButton Component (`src/components/ui/ActionButton.tsx`)
Wrapper around Button that validates action metadata in development:

```tsx
import { ActionButton } from "@/components/ui/ActionButton";

<ActionButton 
  data-action="search:filters:apply"
  data-intent="api"
  data-endpoint="/api/v2/search"
  onClick={handleApplyFilters}
>
  Apply Filters
</ActionButton>
```

**Development warnings for:**
- Missing click handlers
- API intent without endpoint
- Missing data-action attribute

#### ActionMenuItem Component (`src/components/ui/ActionMenuItem.tsx`)
Similar wrapper for dropdown menu items:

```tsx
import { ActionMenuItem } from "@/components/ui/ActionMenuItem";

<ActionMenuItem 
  data-action="rules:item:delete"
  data-intent="api"
  data-endpoint="/api/v2/rules"
  data-danger="true"
  onSelect={handleDeleteRule}
>
  Delete Rule
</ActionMenuItem>
```

### 3. E2E Verification (`cypress/e2e/actions-wire.cy.ts`)

Cypress tests that verify UI actions work with real backend:

```bash
npm run cypress:run
```

**What it tests:**
- Navigation actions actually navigate
- API actions trigger real HTTP calls
- Modal actions open dialogs
- Form submissions work

## 🏗️ Action Metadata Convention

Every actionable element must include these attributes:

### Required Attributes

```tsx
<Button 
  data-action="page:feature:verb"    // Unique identifier
  data-intent="api|navigate|open-modal|submit"  // Action type
  onClick={handler}                   // Actual handler
>
```

### Optional Attributes

```tsx
<Button 
  data-endpoint="/api/v2/endpoint"   // Required if data-intent="api"
  data-danger="true"                 // Skip in destructive e2e tests
>
```

### Intent Types

- **`api`**: Makes HTTP request (requires `data-endpoint`)
- **`navigate`**: Changes page/route
- **`open-modal`**: Opens dialog/modal
- **`submit`**: Form submission

## 📊 Running the Complete Audit

### Full Audit (Recommended)
```bash
npm run audit:full
```
Runs both grep and static analysis.

### Individual Components
```bash
npm run audit:grep      # Pattern detection
npm run audit:actions   # AST analysis
npm run cypress:run     # E2E verification
```

### Complete Test Suite
```bash
npm run test:actions
```
Runs full audit + e2e tests.

## 📈 Understanding Reports

### Grep Report Output
```
🔍 UI Action Anti-Pattern Sweep
================================

## Buttons Missing Handlers
❌ Issues found:
src/app/alerts/page.tsx:220:          <Button variant="outline" className="gap-2">
```

### Static Analysis Report
Generates `action-audit-simple.json` and `action-audit-simple.md`:

```markdown
| File | Line | Tag | Issues | Has onClick | Has data-action |
|------|------|-----|--------|-------------|-----------------|
| src/app/alerts/page.tsx | 220 | Button | missing handler/nav, missing data-action | ❌ | ❌ |
```

### Cypress Test Results
Verifies actual UI behavior:
- ✅ API calls reach backend
- ✅ Navigation works
- ✅ Modals open/close
- ❌ Dead buttons detected

## 🔧 Fixing Common Issues

### 1. Missing Click Handler

**Problem:**
```tsx
<Button variant="outline">Save</Button>
```

**Solution:**
```tsx
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

### 2. Missing Action Metadata

**Problem:**
```tsx
<Button onClick={handleDelete}>Delete</Button>
```

**Solution:**
```tsx
<ActionButton 
  data-action="rules:item:delete"
  data-intent="api"
  data-endpoint="/api/v2/rules"
  data-danger="true"
  onClick={handleDelete}
>
  Delete
</ActionButton>
```

### 3. Intentionally Disabled Elements

**Problem:**
```tsx
<Button disabled>Coming Soon</Button>  // Flagged as missing handler
```

**Solution:**
```tsx
<Button 
  disabled 
  aria-disabled="true"
  data-action="feature:placeholder:disabled"
  data-intent="disabled"
>
  Coming Soon
</Button>
```

### 4. Direct Fetch Usage

**Problem:**
```tsx
const response = await fetch('/api/data');
```

**Solution:**
```tsx
import { http } from '@/lib/http';
const response = await http('/data');
```

## 🚨 Integration with CI/CD

### Pre-commit Hook
```bash
#!/bin/sh
# .git/hooks/pre-commit
npm run audit:full || exit 1
```

### GitHub Actions
```yaml
- name: UI Action Audit
  run: |
    npm run audit:full
    npm run cypress:run --record false
```

## 📋 Action Naming Convention

Use this format for `data-action` values:

```
page:feature:verb
```

**Examples:**
- `search:filters:apply`
- `rules:item:delete`
- `dashboard:chart:refresh`
- `settings:theme:toggle`
- `alerts:bulk:acknowledge`

## 🎛️ Configuration

### Cypress Configuration (`cypress.config.ts`)
```typescript
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    defaultCommandTimeout: 10000,
  },
});
```

### Exclusions
Add to `.gitignore`:
```
action-audit*.json
action-audit*.md
```

## 📊 Metrics & Reporting

The system tracks:
- **Coverage**: % of actionable elements with proper metadata
- **Handler completion**: % of elements with working handlers  
- **E2E pass rate**: % of actions that work end-to-end
- **Technical debt**: Count of TODO/FIXME comments

## 🔄 Maintenance

### Weekly Tasks
1. Run `npm run audit:full`
2. Review and fix flagged issues
3. Update action metadata for new features
4. Run `npm run cypress:run` to verify E2E

### Monthly Tasks
1. Review action naming conventions
2. Update audit rules if needed
3. Clean up dead code flagged by audits

## 🆘 Troubleshooting

### "Module not found" errors
```bash
npm install -D ts-morph globby picocolors cypress cypress-real-events tsx
```

### Cypress hangs on API calls
Check that your development server is running on the expected port.

### False positives in grep sweep
Some patterns may flag legitimate code. Review manually and add exclusions if needed.

## 📚 Related Documentation

- [UI Architecture Rules](../README.md#ui-architecture) [[memory:6316219]]
- [Component Testing Guidelines](./TESTING.md)
- [API Integration Patterns](./API_PATTERNS.md)

---

**Next Steps**: Run `npm run audit:full` to see current issues, then gradually fix them using the ActionButton/ActionMenuItem wrappers and proper metadata conventions.
