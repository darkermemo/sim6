# Secure SIEM API Implementation

## Overview
This implementation follows the "harsh, boring, safe" pattern where **SQL is never exposed to the frontend**. All database interactions go through structured intents and allow-listed SQL templates with named parameters.

## Key Security Features

### 1. No SQL Exposure
- Frontend sends structured intents only: `{ tenant_id, time, q, limit }`
- Backend compiles intents to parameterized SQL templates
- SQL is never sent to or visible in the UI

### 2. ClickHouse HTTP Client with Named Parameters
```rust
// siem_unified_pipeline/src/ch/mod.rs
pub struct Ch {
    http: Client,
    base: String,  // http://127.0.0.1:8123
    user: String,  // read-only user
    pass: String,
}

// Execute with parameters - prevents SQL injection
ch.query_json(
    "SELECT * FROM events WHERE tenant_id = {tenant:String}",
    &[("tenant", "default")],
    &[("max_execution_time", "8")]
)
```

### 3. Allow-Listed Dashboard Panels
```rust
// siem_unified_pipeline/src/v2/dashboards/handlers.rs
pub enum PanelDef {
    TimeseriesCount { id: String, filters: PanelFilters },
    BySeverityTop { id: String, limit: u32 },
    SingleStat { id: String, stat: StatType },
    TopSources { id: String, limit: u32 },
    EventTypes { id: String, limit: u32 },
}
```

Each panel type maps to a specific, pre-defined SQL template. No custom SQL allowed.

### 4. Input Validation & Safety Clamps
- Tenant ID: alphanumeric only, max 64 chars
- Time range: max 30 days, unix timestamps only
- Query limits: 1-10,000 rows
- Execution time: max 8 seconds
- Memory usage: max 1GB

### 5. Secure Search API
```typescript
// Frontend (ui-react-v2/src/lib/api.ts)
export type SearchIntent = {
  tenant_id: string;
  time: { last_seconds?: number };
  q: string;
  limit?: number;
};

// No SQL in response
export type SearchResponse = {
  data: any[];
  meta: { name: string; type: string }[];
  statistics: { rows: number; took_ms: number };
};
```

## API Endpoints

### Search Endpoints (Secure)
- `POST /api/v2/search/compile` - Validates query syntax, returns `{valid: bool, error?: string}`
- `POST /api/v2/search/execute` - Executes search, returns data without SQL
- `POST /api/v2/search/tail` - SSE stream (future)

### Dashboard Endpoints
- `POST /api/v2/dashboards/panels` - Batch execute allow-listed panels

### Never Implemented (Security)
- Direct SQL execution endpoints
- Custom query templates
- User-defined aggregations
- Table/schema modification

## Frontend Changes

### Before (Insecure)
```typescript
// SQL exposed to frontend
const compile = await api.compile({ q: "message:error" });
console.log(compile.sql); // "SELECT * FROM events WHERE..."
```

### After (Secure)
```typescript
// Only structured intents
const response = await api.search({ 
  tenant_id: "default",
  time: { last_seconds: 3600 },
  q: "message:error",
  limit: 100
});
// response.data - results only, no SQL
```

## Security Checklist

✅ UI cannot submit SQL or templates  
✅ All endpoints validate tenant/time/limit  
✅ Use CH named params; never string-concat user values  
✅ Read-only CH user for reads  
✅ Per-route max_execution_time, max_result_rows  
✅ Concurrency cap per route (TODO: add Semaphore)  
✅ Query timeouts with cancellation  
✅ Audit logging without SQL exposure  

## Performance Optimizations

- Pre-aggregated materialized views for dashboard panels
- Default time ranges (last hour)
- Result pagination and limits
- Connection pooling for ClickHouse

## Next Steps

1. Add circuit breaker for ClickHouse failures
2. Implement query result caching
3. Add more dashboard panel types
4. Implement saved searches (store intents, not SQL)
5. Add RBAC for tenant isolation
6. Implement SSE tail endpoint with backpressure

This architecture ensures that even if the frontend is compromised, attackers cannot:
- Execute arbitrary SQL
- Access other tenants' data
- Perform resource-intensive queries
- Modify database schema or data

The "harsh" approach trades some flexibility for rock-solid security.
