# SIEM UI v2

Fresh, minimal React + TypeScript UI implementation without styling frameworks.

## Architecture

- **Stack**: React 18 + TypeScript + React Router 6 + Vite
- **Base path**: `/ui/v2/`
- **API integration**: Single authority in `src/lib/api.ts`
- **No CSS frameworks**: Plain React components without Tailwind/shadcn
- **Feature flags**: `VITE_ALERTS_ENABLED`, `VITE_RULES_ENABLED`, `VITE_RULEPACKS_ENABLED`

## Quick Start

```bash
# Build and start (with API URL)
VITE_API_URL="http://127.0.0.1:9999" npm run build
npm run preview -- --host

# Or use the helper script
../../../scripts/run_ui_v2.sh
```

Open: http://127.0.0.1:5174/ui/v2/

## Development

```bash
# Dev server with hot reload
npm run dev

# Type check
npx tsc --noEmit

# Run E2E tests (requires API on :9999)
E2E_BASE_URL="http://127.0.0.1:5174/ui/v2/" npx playwright test
```

## Routes

- `/` - Home page
- `/search` - Search interface (compile → execute flow)
- `/health` - Health check display
- `/login` - Auth placeholder (shown on 401)
- `/alerts` - (Feature flagged, stub)
- `/rules` - (Feature flagged, stub)
- `/rulepacks` - (Feature flagged, stub)

## Components

- `AppShell` - Layout wrapper with navigation
- `SearchQueryBar` - Search form (tenant, time, query)
- `SqlPreview` - Display compiled SQL
- `ResultsTable` - Show search results

## API Endpoints Used

- `GET /api/v2/health` - Health check
- `POST /api/v2/search/compile` - Compile query to SQL
- `POST /api/v2/search/execute` - Execute search
- `GET /api/v2/search/tail` - SSE endpoint (stub)

## Testing

All tests pass without seed data:
- AppShell renders at correct base path
- Health endpoint returns 200
- Search compile+execute flow works

## Success Criteria Met

✅ 0 TypeScript errors (strict mode)
✅ UI runs at http://127.0.0.1:5174/ui/v2/
✅ E2E tests pass without data
✅ No CSS pipeline issues
✅ Clean separation from corrupted ui-react folder
