# Dashboard and API Endpoint Troubleshooting Guide

## Overview
This document outlines the troubleshooting steps and fixes for dashboard and other API endpoint issues in the SIEM system.

## Problem Summary

### Dashboard Issues (RESOLVED)
1. **camelCase vs snake_case Response Format**: The dashboard API was returning camelCase field names instead of the expected snake_case format.
2. **Proxy Configuration**: The dashboard endpoint was being served by mock data instead of the Rust backend.

### Current Issues (TO BE FIXED)
1. **404 Errors for Notes Endpoints**: Frontend making calls to `/api/v1/alerts/{alertId}/notes` which are not proxied.
2. **404 Errors for SSE Streams**: Server-Sent Events for alert notes at `/api/v1/alerts/{alertId}/notes/stream` are failing.
3. **Missing UUID-based Endpoints**: Various UUID-based API calls are not properly routed.

## Root Cause Analysis

### Dashboard Issue (RESOLVED)
- **Cause**: The `siem_ui_api_server.js` proxy was not properly configured to route dashboard requests to the Rust backend.
- **Impact**: Frontend received mock data with inconsistent field naming (camelCase vs snake_case).

### Notes and SSE Issues (CURRENT)
- **Cause**: Missing proxy routes in `siem_ui_api_server.js` for:
  - Alert notes endpoints (`/api/v1/alerts/{alertId}/notes`)
  - SSE streams (`/api/v1/alerts/{alertId}/notes/stream`)
  - Other UUID-based endpoints
- **Impact**: 404 errors preventing notes functionality and real-time updates.

## Troubleshooting Steps Applied

### Step 1: Dashboard Fix (COMPLETED)
1. **Updated Environment Variables**:
   - Changed `VITE_API_BASE` in `siem_ui/.env` from `http://localhost:8080` to `http://localhost:8081`
   - This ensures frontend uses the proxy server instead of direct Rust API

2. **Proxy Configuration**:
   - Added dashboard proxy route in `siem_ui_api_server.js`:
   ```javascript
   app.all('/api/v1/dashboard*', (req, res) => {
     proxyToRustAPI(req, res, req.path.replace('/api/v1', ''));
   });
   ```
   - Commented out mock dashboard endpoints to prevent conflicts

3. **Server Restart**:
   - Restarted frontend dev server to apply new environment variables
   - Ensured proxy server is running on port 8081

### Step 2: Identify Missing Endpoints (COMPLETED)
1. **Frontend Code Analysis**:
   - Found API calls in `useAlerts.ts`: `/api/v1/alerts/${alertId}/notes`
   - Found API calls in `useAlertNotes.ts`: `/alerts/${alertId}/notes`
   - Found SSE connections in `useSSE.ts`: `/api/v1/alerts/${alertId}/notes/stream`

2. **Proxy Gap Analysis**:
   - Current proxy only covers: `dashboard*`, `alerts*`, `rules*`, `cases*`, `events*`
   - Missing specific handling for notes sub-endpoints and SSE streams

## Required Fixes

### Fix 1: Add Notes Endpoint Proxy
The current `app.all('/api/v1/alerts*')` should handle notes, but may need specific configuration for:
- POST requests to create notes
- SSE stream endpoints

### Fix 2: Add SSE Support
Server-Sent Events require special handling in the proxy:
- Different content-type headers
- Stream forwarding instead of JSON response

### Fix 3: Verify Rust Backend Support
Ensure the Rust backend actually implements:
- Alert notes CRUD operations
- SSE streams for real-time updates

## Implementation Plan

### Phase 1: Update Proxy Configuration
1. Add specific SSE handling in `siem_ui_api_server.js`
2. Ensure proper header forwarding for streaming endpoints
3. Add error handling for missing backend endpoints

### Phase 2: Backend Verification
1. Check if Rust backend implements notes endpoints
2. Add mock endpoints if backend is missing functionality
3. Implement proper SSE forwarding

### Phase 3: Testing
1. Test all dashboard functionality
2. Test notes creation and retrieval
3. Test real-time updates via SSE
4. Verify no 404 errors in browser console

## Monitoring and Validation

### Success Criteria
- [ ] Dashboard loads without 404 errors
- [ ] Notes can be created and retrieved
- [ ] Real-time updates work via SSE
- [ ] All API responses use consistent snake_case format
- [ ] No console errors related to missing endpoints

### Testing Commands
```bash
# Test dashboard endpoint
curl http://localhost:8081/api/v1/dashboard | jq

# Test notes endpoint (replace with actual alert ID)
curl http://localhost:8081/api/v1/alerts/550e8400-e29b-41d4-a716-446655440001/notes

# Check SSE stream (replace with actual alert ID)
curl -N http://localhost:8081/api/v1/alerts/550e8400-e29b-41d4-a716-446655440001/notes/stream
```

## Lessons Learned

1. **Environment Configuration**: Always verify environment variables are properly set and servers restarted.
2. **Proxy vs Direct API**: Use proxy server for development to handle missing endpoints gracefully.
3. **Field Naming Consistency**: Ensure consistent serialization format (snake_case) across all endpoints.
4. **Comprehensive Route Coverage**: Map all frontend API calls to ensure no 404 errors.
5. **SSE Handling**: Streaming endpoints require special proxy configuration.

## Next Steps

After implementing the fixes:
1. Apply the same troubleshooting methodology to other pages with similar issues
2. Create automated tests to prevent regression
3. Document all API endpoints and their proxy configurations
4. Consider implementing a more robust API gateway solution for production