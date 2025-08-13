# SIEM v2 UI Access Guide

## 🚀 Correct URLs

The UI is configured with base path `/ui/v2/` - all pages MUST use this prefix:

### Golden Standard Pages (with modern design):
- **Home**: http://localhost:5174/ui/v2/
- **Search**: http://localhost:5174/ui/v2/search
- **Dashboard**: http://localhost:5174/ui/v2/dashboard
- **Health**: http://localhost:5174/ui/v2/health

### API Endpoints:
- **Base**: http://localhost:9999/api/v2/
- **Health Check**: http://localhost:9999/api/v2/health

## ❌ Common Mistakes

These URLs will NOT work:
- ~~http://localhost:5174/search~~ → Use http://localhost:5174/ui/v2/search
- ~~http://localhost:5174/dashboard~~ → Use http://localhost:5174/ui/v2/dashboard
- ~~http://localhost:5173/ui/app/~~ → Old UI, not running

## 🔧 Current Status

✅ **UI Running**: http://localhost:5174/ui/v2/ (with modern design)
✅ **API Running**: http://localhost:9999/api/v2/ 
⚠️  **Dashboard**: Currently using mock data (metrics endpoints need implementation)

## 🎨 Design System

All pages use the consistent modern design with:
- Gradient logo and headers
- Dark mode support
- CSS variables for theming
- Card-based layouts
- Consistent spacing and typography

## 🔧 Running the Services

```bash
# API (already running on port 9999)
ps aux | grep siem-pipeline

# UI (already running on port 5174)
ps aux | grep "vite.*5174"

# To restart UI if needed:
cd siem_unified_pipeline/ui-react-v2
pkill -f "vite.*5174" || true
npm run preview -- --host 0.0.0.0
```

## 📊 Features

### Search Page (/ui/v2/search)
- Query builder with SQL compilation
- Real-time results with facets
- Timeline visualization
- Live tail (SSE streaming)
- Saved searches

### Dashboard Page (/ui/v2/dashboard)
- KPI metrics (ingest, queries, storage, errors)
- Time series charts
- Component health monitoring
- Recent alerts table
- Index freshness gauge
- Auto-refresh every 30 seconds

Both pages follow the Golden Standard pattern with:
- No SQL exposure from UI
- Structured API calls only
- Complete TypeScript typing
- Comprehensive error handling
