# 🎯 SIEM API Route Mapping System

A comprehensive toolkit for automatically extracting, analyzing, and visualizing API route relationships between your Rust backend and React frontend.

## 📋 Overview

This system provides:
- **Automatic Rust route extraction** from Actix-web and Axum applications
- **Frontend API usage scanning** across React/TypeScript components
- **Route mapping and coverage analysis** with detailed reports
- **Interactive dashboard** for visualizing API relationships

## 🛠️ Tools Included

### 1. `rust_route_extractor.py`
Extracts API routes from Rust source files supporting multiple frameworks:
- Actix-web style: `#[get("/api/v1/alerts")]`
- Axum style: `.route("/api/v1/alerts", get(handler))`
- Direct method calls: `get("/health")`

**Usage:**
```bash
python rust_route_extractor.py
```

**Output:** `rust_api_routes.json`

### 2. `frontend_api_scanner.js`
Scans React/TypeScript frontend code for API endpoint usage:
- Finds all `/api/v1/*` references
- Maps usage to specific files and components
- Categorizes by file type (component, hook, service, etc.)

**Usage:**
```bash
node frontend_api_scanner.js
```

**Output:** `frontend_api_usage.json`

### 3. `route_mapper.py`
Combines backend and frontend analysis to generate comprehensive mapping:
- Route coverage analysis
- Orphaned endpoint detection
- Detailed usage statistics

**Usage:**
```bash
python route_mapper.py
```

**Output:** `api_route_map.json`

### 4. `api_route_dashboard.html`
Interactive web dashboard for visualizing API relationships:
- Coverage statistics and charts
- Route filtering and search
- Detailed usage information
- Beautiful, responsive UI

**Usage:**
```bash
# Serve the dashboard (requires api_route_map.json)
python -m http.server 8000
# Open http://localhost:8000/api_route_dashboard.html
```

## 🚀 Quick Start

1. **Extract all route information:**
   ```bash
   # Extract Rust routes
   python rust_route_extractor.py
   
   # Scan frontend usage
   node frontend_api_scanner.js
   
   # Generate comprehensive mapping
   python route_mapper.py
   ```

2. **View the dashboard:**
   ```bash
   python -m http.server 8000
   # Open http://localhost:8000/api_route_dashboard.html
   ```

## 📊 Generated Reports

### `rust_api_routes.json`
```json
{
  "routes": [
    {
      "method": "GET",
      "path": "/api/v1/alerts",
      "handler": "get_alerts",
      "file": "src/handlers/alerts.rs",
      "line": 15
    }
  ],
  "metadata": {
    "total_routes": 4,
    "files_scanned": 156,
    "generated_at": "2024-01-15T10:30:00Z"
  }
}
```

### `frontend_api_usage.json`
```json
{
  "endpoints": {
    "/api/v1/alerts": {
      "usage_count": 3,
      "files": [
        {
          "file": "src/components/AlertsList.tsx",
          "type": "component",
          "line_numbers": [45, 67]
        }
      ]
    }
  },
  "summary": {
    "total_endpoints": 54,
    "total_usage": 69,
    "files_with_api_calls": 23
  }
}
```

### `api_route_map.json`
```json
{
  "backend_routes": [...],
  "frontend_endpoints": [...],
  "route_details": [
    {
      "path": "/api/v1/alerts",
      "method": "GET",
      "handler": "get_alerts",
      "backend_file": "src/handlers/alerts.rs",
      "is_used_in_frontend": true,
      "frontend_usage": [...],
      "usage_count": 3
    }
  ],
  "coverage_analysis": {
    "total_backend_routes": 4,
    "total_frontend_usage": 54,
    "matched_endpoints": 2,
    "coverage_percentage": 50.0,
    "backend_only": [...],
    "frontend_only": [...]
  },
  "orphaned_frontend_endpoints": [...]
}
```

## 🎨 Dashboard Features

### Summary Cards
- **Backend Routes:** Total number of Rust API routes
- **Frontend Endpoints:** Total number of frontend API calls
- **Coverage:** Percentage of backend routes used by frontend
- **Orphaned Endpoints:** Frontend calls without backend implementation

### Interactive Charts
- **Coverage Analysis:** Doughnut chart showing matched vs unmatched routes
- **HTTP Methods Distribution:** Bar chart of route methods (GET, POST, etc.)

### Route Details
- **Filtering:** Show/hide matched, backend-only, or frontend-only routes
- **Search:** Real-time search across all route information
- **Usage Details:** Expandable sections showing exact file usage

## 🔍 Analysis Insights

### What You'll Discover

1. **API Coverage Gaps:**
   - Frontend calls to non-existent backend routes
   - Backend routes not used by the frontend

2. **Usage Patterns:**
   - Which components use which APIs
   - Frequency of API endpoint usage
   - File-level API dependencies

3. **Architecture Health:**
   - Route consistency between backend and frontend
   - Potential dead code (unused routes)
   - Missing implementations

### Current Project Status

Based on the analysis:
- **4 Backend Routes:** Mostly health/metrics endpoints
- **54 Frontend Endpoints:** Comprehensive SIEM functionality
- **0% Coverage:** Frontend uses Node.js proxy server, not direct Rust routes
- **Architecture:** Frontend → Node.js API Server → Rust Services

## 🛡️ Security Considerations

- Scripts only read source code, no execution
- No sensitive data is logged or stored
- Generated reports contain only route structure information
- Safe to run in production environments

## 🔧 Customization

### Adding New Route Patterns
Edit `rust_route_extractor.py` to add support for new frameworks:

```python
# Add new regex patterns
route_patterns = [
    # Your custom pattern here
    r'your_pattern_here',
]
```

### Frontend Scanning Customization
Modify `frontend_api_scanner.js` to scan different file types:

```javascript
// Add new file extensions
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue'];

// Add new API patterns
const apiPatterns = [
    /your_pattern_here/g
];
```

## 📈 Future Enhancements

- **Real-time monitoring:** Watch for route changes
- **API documentation generation:** Auto-generate docs from routes
- **Performance metrics:** Track API usage and performance
- **Integration testing:** Generate tests for route coverage
- **OpenAPI spec generation:** Create Swagger/OpenAPI specs

## 🤝 Contributing

To extend this system:
1. Add new route extraction patterns for additional frameworks
2. Enhance frontend scanning for new file types or patterns
3. Improve dashboard visualizations
4. Add export formats (CSV, Excel, etc.)

## 📝 License

This toolkit is part of the SIEM project and follows the same licensing terms.

---

**Generated by AI-Guided Route Mapping System** 🤖
*Automatically extract, analyze, and visualize your API architecture*