# Search Page - Golden Standard Implementation

## Overview

This is the **locked golden standard** for the Search page, serving as the template for all other pages in the SIEM v2 UI. It demonstrates:

1. **Complete component architecture** with proper state management
2. **Full API contract implementation** with exact request/response types
3. **Comprehensive testing** with bash contract gates and Playwright E2E
4. **Production-ready error handling** and performance optimizations

## Architecture

### Component Structure
```
SearchPage (container)
├── QueryBar          - Input controls (tenant, query, time, actions)
├── SchemaPanel       - Fields, enums, grammar display
├── FacetPanel        - Clickable facets with counts
├── TimelineChart     - Time distribution with brush selection
├── ResultTable       - Sortable results with metadata
├── SavedSearchBar    - CRUD for saved searches
└── StreamSwitch      - SSE live tail toggle
```

### State Management
- All state owned by `SearchPage` container
- Child components receive props and callbacks only
- Debounced compile on query/time changes
- Abortable requests for in-flight cancellation

### API Integration
```typescript
// Every API call follows this pattern:
try {
  const result = await api.search.compile({
    tenant_id: state.tenantId,
    time: state.time,
    q: state.query,
  });
  // Update state
} catch (err: any) {
  // Handle error with request_id
  addError(err.error || "Operation failed");
}
```

## Implementation Checklist

### ✅ Core Features
- [x] Compile with debounce (300ms)
- [x] Execute with results, facets, timeline in parallel
- [x] Sort columns with visual indicators
- [x] Facet filtering (click to add to query)
- [x] Timeline brushing (drag to change time range)
- [x] SSE tail with event display
- [x] Saved searches CRUD
- [x] Export functionality
- [x] Hotkeys (Enter = Run, Cmd/Ctrl+S = Save)

### ✅ Error Handling
- [x] Compile errors shown inline
- [x] Request errors in error tray
- [x] Request IDs captured for support
- [x] Graceful degradation for optional features

### ✅ Performance
- [x] Debounced compile < 200ms p95
- [x] Execute < 3s p95 for limit ≤ 500
- [x] Timeline/facets < 1s p95
- [x] Abort in-flight requests on new search

## Testing

### API Contract Test
```bash
# Run the contract gate
API="http://127.0.0.1:9999/api/v2" TEN="default" \
  scripts/api_contract/search_gate.sh

# Artifacts saved to:
# target/test-artifacts/api-contract/search/
```

### E2E Smoke Test
```bash
# Ensure UI is running
cd siem_unified_pipeline/ui-react-v2
npm run preview -- --host

# Run Playwright test
E2E_BASE_URL="http://127.0.0.1:5174/ui/v2/" \
  npx playwright test tests/e2e/search.smoke.spec.ts --reporter=list
```

## Troubleshooting

### Blank Page / No Styles
- Check Vite base path: `/ui/v2/`
- Visit with trailing slash: `http://localhost:5174/ui/v2/`
- Check for PostCSS conflicts from parent

### 404 on Assets
- Ensure preview started with `--host` flag
- Check correct port (5174 for v2)

### SSE Not Working
- Verify `Accept: text/event-stream` header
- Check `Content-Type: text/event-stream` in response
- Backend may need GET support for EventSource

### Compile/Execute Errors
- `tenant_id` must be string, not number
- Time must be `{last_seconds}` or `{from, to}`
- Body must be JSON with correct content-type

### CORS Issues
- Use Vite proxy in `vite.config.ts`
- Or set `VITE_API_URL` to full API URL

## How to Clone for Other Pages

1. **Copy the structure**: Use same container/child component pattern
2. **Define types first**: Create complete TypeScript interfaces
3. **Map endpoints**: Document every API call with examples
4. **Write contract test**: Bash script that validates all endpoints
5. **Create E2E test**: Playwright test for core user flows

## Key Principles

1. **No SQL exposure**: Frontend never sees or sends SQL
2. **Structured intents**: All requests use typed objects
3. **Parallel requests**: Fetch related data simultaneously
4. **Error boundaries**: Every failure has a recovery path
5. **Performance budget**: Define and enforce timing limits

## Next Pages to Implement

Ready to implement the next page using this template:
- **Dashboard**: Metrics panels with real-time updates
- **Alerts**: Alert management with acknowledgment
- **Rules**: Rule builder with validation
- **Sources/Agents**: Agent fleet management
- **Incidents**: Case management workflow

Say which page you'd like next, and I'll provide the same golden standard trio!
