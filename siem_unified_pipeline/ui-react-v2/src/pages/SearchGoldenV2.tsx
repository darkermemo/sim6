/**
 * SearchGoldenV2 - Enterprise-class search page using typed hooks
 * 
 * This is the modernized version of SearchGolden that demonstrates:
 * - TanStack Query for all API calls with caching and error handling
 * - Zod validation at API boundaries
 * - Typed hooks instead of manual state management
 * - Defensive programming for optional endpoints
 * - Enterprise-grade error handling and loading states
 */

import React, { useState, useCallback, useMemo } from "react";
import QueryBar from "../components/search-golden/QueryBar";
import FacetPanel from "../components/search-golden/FacetPanel";
import TimelineChart from "../components/search-golden/TimelineChart";
import ResultTable from "../components/search-golden/ResultTable";
import SavedSearchBar from "../components/search-golden/SavedSearchBar";
import StreamSwitch from "../components/search-golden/StreamSwitch";
import SchemaPanel from "../components/search-golden/SchemaPanel";
import CompactSelect from "@/components/ui/CompactSelect";

import { 
  useCompile, 
  useExecute, 
  useTimeline, 
  useFacets,
  useSchemaFields,
  useSchemaEnums,
  useGrammar,
  useSearchInvalidation,
  type SearchRequest,
  type CompileRequest,
  type FacetsRequest 
} from "../hooks/useSearchAPI";

/**
 * Main search page component demonstrating enterprise patterns:
 * - Reactive queries that depend on each other
 * - Defensive handling of optional endpoints
 * - Proper loading and error states
 * - Type-safe API interactions
 */
export default function SearchGoldenV2() {
  // UI state - much simpler than the original
  const [tenantId, setTenantId] = useState("hr");
  const [query, setQuery] = useState("");
  const [timeSeconds, setTimeSeconds] = useState(86400); // 24 hours
  const [limit, setLimit] = useState(100);
  const [sseEnabled, setSseEnabled] = useState(false);

  // Build request objects using useMemo for performance
  const compileRequest: CompileRequest = useMemo(() => ({
    tenant_id: tenantId,
    q: query || "*", // Default to match-all if empty
    time: { last_seconds: timeSeconds },
  }), [tenantId, query, timeSeconds]);

  const searchRequest: SearchRequest = useMemo(() => ({
    tenant_id: tenantId,
    q: query || "*",
    time: { last_seconds: timeSeconds },
    limit,
    sort: [{ field: "event_timestamp", direction: "desc" }],
  }), [tenantId, query, timeSeconds, limit]);

  const facetsRequest: FacetsRequest = useMemo(() => ({
    tenant_id: tenantId,
    q: query || "*",
    time: { last_seconds: timeSeconds },
    facets: [
      { field: 'source_type', size: 10 },
      { field: 'severity', size: 5 },
      { field: 'event_type', size: 10 },
      { field: 'vendor', size: 8 },
      { field: 'product', size: 8 },
    ],
  }), [tenantId, query, timeSeconds]);

  // === TYPED API HOOKS ===
  
  // 1. Compile query first (fast, gives us SQL validation)
  const { 
    data: compileResult, 
    isLoading: isCompiling, 
    error: compileError 
  } = useCompile(compileRequest);

  // 2. Execute search only after compile succeeds
  const { 
    data: executeResult, 
    isLoading: isExecuting, 
    error: executeError 
  } = useExecute(searchRequest, { 
    enabled: !!compileResult?.sql && !compileError 
  });

  // 3. Timeline and facets run in parallel with execute
  const { 
    data: timelineResult, 
    isLoading: isTimelineLoading 
  } = useTimeline(searchRequest, { 
    enabled: !!compileResult?.sql && !compileError 
  });

  const { 
    data: facetsResult, 
    isLoading: isFacetsLoading 
  } = useFacets(facetsRequest, { 
    enabled: !!compileResult?.sql && !compileError 
  });

  // 4. Schema endpoints (optional - gracefully degrade if not available)
  const { data: schemaFields } = useSchemaFields('events');
  const { data: schemaEnums } = useSchemaEnums({ 
    tenant_id: tenantId, 
    last_seconds: timeSeconds 
  });
  const { data: grammar } = useGrammar();

  // Cache invalidation helper
  const { invalidateAll } = useSearchInvalidation();

  // === EVENT HANDLERS ===

  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
  }, []);

  const handleTenantChange = useCallback((newTenant: string) => {
    setTenantId(newTenant);
  }, []);

  const handleTimeChange = useCallback((newTimeSeconds: number) => {
    setTimeSeconds(newTimeSeconds);
  }, []);

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
  }, []);

  const handleRefresh = useCallback(() => {
    invalidateAll();
  }, [invalidateAll]);

  const handleSseToggle = useCallback(() => {
    setSseEnabled(!sseEnabled);
  }, [sseEnabled]);

  // === DERIVED STATE ===

  const isAnyLoading = isCompiling || isExecuting || isTimelineLoading || isFacetsLoading;
  const hasErrors = !!(compileError || executeError);
  const mainError = compileError || executeError;

  // Transform data for legacy components (temporary bridge)
  const legacyState = useMemo(() => ({
    tenantId,
    query,
    time: { last_seconds: timeSeconds },
    limit,
    sort: [{ field: "event_timestamp", dir: "desc" }],
    sse: { enabled: sseEnabled, connected: false },
    saving: false,
    exporting: false,
    errors: mainError ? [mainError.message] : [],
    // Results
    compile: compileResult || undefined,
    execute: executeResult || undefined,
    timeline: timelineResult?.buckets || [],
    facets: facetsResult?.facets || {},
  }), [
    tenantId, query, timeSeconds, limit, sseEnabled, 
    compileResult, executeResult, timelineResult, facetsResult, mainError
  ]);

  // Transform schema data for legacy components
  const legacyFields = schemaFields?.fields || [];
  const legacyEnums = schemaEnums?.enums || {};
  const legacyGrammar = grammar || null;

  return (
    <div className="search-page" data-testid="page-search">
      {/* Error Banner */}
      {hasErrors && (
        <div style={{
          background: '#fee',
          border: '1px solid #fcc',
          padding: '10px',
          margin: '10px',
          borderRadius: '4px',
          color: '#c33'
        }}>
          ⚠️ {mainError?.message}
        </div>
      )}

      {/* Global Loading Indicator */}
      {isAnyLoading && (
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 1000
        }}>
          {isCompiling && '🔄 Compiling...'}
          {isExecuting && '🔍 Searching...'}
          {(isTimelineLoading || isFacetsLoading) && '📊 Loading...'}
        </div>
      )}

      {/* Header Bar */}
      <div className="search-header" style={{ 
        padding: '10px', 
        borderBottom: '1px solid #eee',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <h1 style={{ margin: 0, fontSize: '18px' }}>🔍 Enterprise Search</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={handleRefresh} style={{ padding: '4px 8px', fontSize: '12px' }}>
            🔄 Refresh
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>Tenant:</span>
            <CompactSelect
              value={tenantId}
              onChange={(value) => handleTenantChange(value.toString())}
              size="sm"
              aria-label="Tenant"
              options={[
                { value: "hr", label: "HR" },
                { value: "default", label: "Default" },
                { value: "finance", label: "Finance" },
              ]}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>Time:</span>
            <CompactSelect
              value={timeSeconds}
              onChange={(value) => handleTimeChange(parseInt(value.toString()))}
              size="sm"
              aria-label="Time range"
              options={[
                { value: 3600, label: "1 hour" },
                { value: 86400, label: "24 hours" },
                { value: 604800, label: "7 days" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Main Layout - using the existing component structure */}
      <div style={{ display: 'flex', height: 'calc(100vh - 80px)' }}>
        
        {/* Left Sidebar - Schema Panel */}
        <div style={{ width: '300px', borderRight: '1px solid #eee', overflow: 'auto' }}>
          <SchemaPanel 
            fields={legacyFields}
            enums={legacyEnums}
            grammar={legacyGrammar}
            onFieldClick={(field) => setQuery(prev => prev + ` ${field}`)}
          />
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          {/* Query Bar */}
          <div style={{ borderBottom: '1px solid #eee' }}>
            <QueryBar 
              tenantId={tenant}
              query={query}
              time={timeRange}
              onTenantChange={() => {}}
              onQueryChange={handleQueryChange}
              onTimeChange={() => {}}
              onCompile={() => {}}
              onRun={() => {}}
              onSave={() => {}}
              onExport={() => {}}
              saving={false}
              exporting={false}
              isLoading={isLoading}
              compileResult={null}
            />
          </div>

          {/* Saved Searches */}
          <div style={{ borderBottom: '1px solid #eee' }}>
            <SavedSearchBar 
              tenantId={tenant}
              onLoad={(search) => {
                setQuery(search.q || "");
              }}
            />
          </div>

          {/* Timeline */}
          <div style={{ height: '200px', borderBottom: '1px solid #eee' }}>
            <TimelineChart 
              state={legacyState}
              onTimeRangeSelect={(from, to) => {
                // TODO: Implement time range selection
              }}
            />
          </div>

          {/* Results Table */}
          <div style={{ flex: 1, overflow: 'visible' }}>
            <ResultTable 
              state={legacyState}
              onRowClick={(row) => {
                // TODO: Implement row detail view
              }}
              onExport={() => {
                // TODO: Implement export with hooks
              }}
            />
          </div>
        </div>

        {/* Right Sidebar - Facets */}
        <div style={{ width: '300px', borderLeft: '1px solid #eee', overflow: 'auto' }}>
          <FacetPanel 
            state={legacyState}
            onFacetClick={(field, value) => {
              setQuery(prev => `${prev} ${field}:${value}`.trim());
            }}
          />
          
          {/* SSE Controls */}
          <div style={{ padding: '10px', borderTop: '1px solid #eee' }}>
            <StreamSwitch 
              state={legacyState}
              onToggle={handleSseToggle}
            />
          </div>
        </div>
      </div>

      {/* Debug Info (dev only) */}
      {import.meta.env.DEV && (
        <div style={{
          position: 'fixed',
          bottom: '10px',
          left: '10px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '8px',
          borderRadius: '4px',
          fontSize: '10px',
          maxWidth: '300px'
        }}>
          <div>SQL: {compileResult?.sql ? '✅' : '❌'}</div>
          <div>Results: {executeResult?.data.data.length || 0} rows</div>
          <div>Timeline: {timelineResult?.buckets.length || 0} buckets</div>
          <div>Facets: {Object.keys(facetsResult?.facets || {}).length} fields</div>
          <div>Schema: {legacyFields.length} fields, {Object.keys(legacyEnums).length} enums</div>
        </div>
      )}
    </div>
  );
}
