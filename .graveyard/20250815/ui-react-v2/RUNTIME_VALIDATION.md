# Runtime Validation System

## Golden "No Runtime Errors" Standard

A page is considered healthy **only if** it passes all these checks during automated E2E testing:

1. ✅ **Zero pageerror** (uncaught exceptions)
2. ✅ **Zero console.error / console.warn** (configurable)
3. ✅ **Zero network 4xx/5xx** except allowlisted endpoints
4. ✅ **All API calls validate with Zod** (with hard-fail in test mode)
5. ✅ **App-ready marker** is set (`data-app-ready="1"`)
6. ✅ **Critical interactions** work without errors
7. ✅ **No ErrorBoundary** components visible

If any check fails → test fails → CI blocks merge.

## Quick Start

### Run Golden Validation
```bash
# Complete validation suite
npm run test:golden

# Individual checks
npm run typecheck        # TypeScript validation
npm run lint            # ESLint validation
npm run build:test      # Build with hard-fail Zod
npm run e2e:runtime     # Runtime error tests
```

### Development with Hard Validation
```bash
# Dev server with hard-fail Zod (crashes on schema mismatch)
npm run dev:test

# Preview with hard-fail Zod
npm run preview:test
```

## Architecture

### 1. Runtime Guard (`src/lib/runtimeGuard.ts`)

Global error trapping system that captures:
- **Page errors**: uncaught exceptions, unhandled rejections
- **Console output**: errors and warnings
- **Network failures**: 4xx/5xx responses (with allowlist)

```typescript
// Installed in main.tsx before app renders
installRuntimeGuard([
  /\/api\/v2\/search\/grammar$/,  // Allow 404 for optional endpoints
]);

// Access runtime issues for debugging
window.__rt.getIssues()
```

### 2. Error Boundary (`src/components/ErrorBoundary.tsx`)

React error boundary that:
- Catches component rendering errors
- Displays detailed error information
- Reports to runtime guard
- Provides recovery options

```tsx
// Wrap entire app
<ErrorBoundary>
  <App />
</ErrorBoundary>

// Or individual components
<ErrorBoundary fallback={<CustomError />}>
  <RiskyComponent />
</ErrorBoundary>
```

### 3. App Ready Marker

Set `data-app-ready="1"` when app finishes loading critical data:

```typescript
// Automatically set in main.tsx after render
markAppReady();

// Tests wait for this before validation
await page.waitForSelector('[data-app-ready="1"]');
```

### 4. Zod Hard-Fail Mode

Environment variable `VITE_HARD_FAIL_ON_SCHEMA=1` makes schema validation throw instead of logging:

```typescript
// In http.ts - throws ValidationError in test mode
if (import.meta.env.VITE_HARD_FAIL_ON_SCHEMA === "1") {
  throw new ValidationError("Schema mismatch", parsed.error.issues);
}
```

## Testing

### Playwright Helpers (`tests/helpers/runtime.ts`)

```typescript
import { expectPageHealthy, expectPageGolden } from '../helpers/runtime';

// Basic runtime health check
await expectPageHealthy(page, {
  allow: [/\/api\/v2\/optional-endpoint$/],
  allowWarnings: false
});

// Complete golden page validation
await expectPageGolden(page, 'page-search', {
  allow: [/\/api\/v2\/search\/grammar$/]
});

// Test interactions without runtime errors
await expectInteractionHealthy(page, async () => {
  await page.click('[data-testid="dangerous-button"]');
}, { allow: [/\/api\/v2\/may-fail$/] });
```

### Writing No-Runtime Tests

Create `*.no-runtime.spec.ts` files for each page:

```typescript
test('Page loads without runtime errors', async ({ page }) => {
  await page.goto('/page-url');
  await expectPageGolden(page, 'page-testid', {
    allow: [/\/api\/v2\/optional-endpoint$/]
  });
});

test('Interactions work without runtime errors', async ({ page }) => {
  await page.goto('/page-url');
  
  await expectInteractionHealthy(page, async () => {
    await page.click('#button');
    await page.fill('#input', 'value');
    await page.press('#input', 'Enter');
  });
});
```

## Page Requirements

### Every Page Must Have:
1. **Root element** with `data-testid="page-{name}"`
2. **ErrorBoundary** wrapper (or app-level boundary)
3. **Defensive rendering** with optional chaining (`?.`) and nullish coalescing (`??`)
4. **Zod schemas** for all API responses
5. **Error handling** for failed API calls

### Example Page Structure:
```tsx
export default function MyPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData().catch(err => setError(err.message));
  }, []);

  if (error) return <div>Error: {error}</div>;
  if (!data) return <div>Loading...</div>;

  return (
    <div data-testid="page-my-page">
      {/* Defensive rendering */}
      {data?.items?.length > 0 ? (
        data.items.map(item => (
          <div key={item?.id || 'unknown'}>
            {item?.name ?? 'No name'}
          </div>
        ))
      ) : (
        <div>No items available</div>
      )}
    </div>
  );
}
```

## CI Integration

### Package.json Scripts:
- `npm run test:golden` - Complete validation pipeline
- `npm run build:test` - Build with hard-fail Zod
- `npm run e2e:runtime` - Runtime error tests only

### CI Pipeline Example:
```yaml
- name: Validate Golden Standard
  run: |
    npm ci
    npm run test:golden
```

## Debugging Runtime Issues

### View Runtime Issues:
```javascript
// In browser console
window.__rt.getIssues()

// Clear issues
window.__rt.clearIssues()
```

### Common Issues:

1. **Undefined object access**: Use optional chaining
   ```typescript
   // Bad
   data.items.length
   
   // Good  
   data?.items?.length ?? 0
   ```

2. **Missing API endpoints**: Add to allowlist
   ```typescript
   allow: [/\/api\/v2\/optional-endpoint$/]
   ```

3. **Schema mismatches**: Update Zod schema or fix API response
   ```typescript
   // Check console for Zod validation errors
   console.error('Zod schema mismatch', { issues })
   ```

4. **Async race conditions**: Ensure data is loaded before rendering
   ```typescript
   if (!data) return <Loading />;
   // Only render when data is available
   ```

## Benefits

- **Zero false positives**: Pages can't appear "working" while hiding errors
- **Deterministic testing**: Runtime errors cause immediate test failures
- **Production safety**: Defensive rendering prevents user-facing crashes
- **Schema contracts**: API changes break builds, not users
- **CI confidence**: Merge only genuinely healthy code

## Golden Page Kit

When creating new pages, use this template:

1. Copy `src/pages/SearchGolden.tsx` as starting point
2. Add `data-testid="page-{name}"` to root element
3. Wrap in `<ErrorBoundary>` if not app-level
4. Use `api-golden.ts` pattern for API calls
5. Add Zod schemas for responses
6. Write `*.no-runtime.spec.ts` test
7. Run `npm run test:golden` before merge

This ensures every page meets the golden standard from day one.
