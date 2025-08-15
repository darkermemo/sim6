/**
 * SearchGoldenV4 - Complete enterprise search with Phases 3 & 4
 * 
 * Phase 3: ECharts Integration
 * - Production-grade timeline charts
 * - Small multiples for facet visualization
 * - Theme-aware charts (light/dark)
 * - Defensive rendering (no crashes on missing data)
 * 
 * Phase 4: Query UX Hardening
 * - Debounced compile (300ms) prevents API spam
 * - AbortController cancels previous requests
 * - SSE tail with auto-reconnect
 * - Comprehensive error boundaries
 * - Predictable search UX
 */

import React, { useState, useCallback, useMemo } from "react";
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
import CompactSelect from "@/components/ui/CompactSelect";

import VirtualizedTable, { type TableColumn, type TableRow } from "../components/VirtualizedTable";
import VirtualizedFacets from "../components/VirtualizedFacets";
import Chart, { ChartUtils } from "../components/Chart";
import useDebounce from "../hooks/useDebounce";
import useSSE from "../hooks/useSSE";

/**
 * Enterprise Search Page - Phases 3 & 4 Complete
 * 
 * This represents the culmination of our enterprise transformation:
 * - Production-grade charts with ECharts
 * - Debounced queries for smooth UX
 * - SSE real-time tail with reconnection
 * - Comprehensive error handling
 * - Performance optimized
 */
export default function SearchGoldenV4() {
  // === STATE ===
  const [tenantId, setTenantId] = useState("default");
  const [query, setQuery] = useState("*");
  const [timeSeconds, setTimeSeconds] = useState(86400);
  const [limit, setLimit] = useState(1000);
  
  // UI State
  const [selectedRows, setSelectedRows] = useState<TableRow[]>([]);
  const [selectedRowDetails, setSelectedRowDetails] = useState<TableRow | null>(null);
  const [sseEnabled, setSseEnabled] = useState(false);
  const [tailEvents, setTailEvents] = useState<any[]>([]);

  // === DEBOUNCED QUERIES ===
  // Key innovation: debounce the query to prevent API spam while typing
  const debouncedQuery = useDebounce(query, 300);
  const debouncedTenant = useDebounce(tenantId, 100);
  const debouncedTime = useDebounce(timeSeconds, 200);

  // Build request objects using debounced values
  const compileRequest: CompileRequest = useMemo(() => ({
    tenant_id: debouncedTenant,
    q: debouncedQuery || "*",
    time: { last_seconds: debouncedTime },
  }), [debouncedTenant, debouncedQuery, debouncedTime]);

  const searchRequest: SearchRequest = useMemo(() => ({
    tenant_id: debouncedTenant,
    q: debouncedQuery || "*",
    time: { last_seconds: debouncedTime },
    limit,
    sort: [{ field: "event_timestamp", direction: "desc" }],
  }), [debouncedTenant, debouncedQuery, debouncedTime, limit]);

  const facetsRequest: FacetsRequest = useMemo(() => ({
    tenant_id: debouncedTenant,
    q: debouncedQuery || "*",
    time: { last_seconds: debouncedTime },
    facets: [
      { field: 'source_type', size: 25 },
      { field: 'severity', size: 10 },
      { field: 'event_type', size: 20 },
      { field: 'vendor', size: 15 },
      { field: 'product', size: 15 },
      { field: 'event_outcome', size: 10 },
      { field: 'event_category', size: 12 },
      { field: 'event_action', size: 20 },
    ],
  }), [debouncedTenant, debouncedQuery, debouncedTime]);

  // === API HOOKS ===
  
  const { 
    data: compileResult, 
    isLoading: isCompiling, 
    error: compileError 
  } = useCompile(compileRequest);

  const { 
    data: executeResult, 
    isLoading: isExecuting, 
    error: executeError 
  } = useExecute(searchRequest, { 
    enabled: !!compileResult?.sql && !compileError 
  });

  const { 
    data: timelineResult, 
    isLoading: isTimelineLoading,
    error: timelineError
  } = useTimeline(searchRequest, { 
    enabled: !!compileResult?.sql && !compileError 
  });

  const { 
    data: facetsResult, 
    isLoading: isFacetsLoading,
    error: facetsError
  } = useFacets(facetsRequest, { 
    enabled: !!compileResult?.sql && !compileError 
  });

  // Schema hooks
  const { data: schemaFields } = useSchemaFields('events');
  const { data: grammar } = useGrammar();

  // Cache invalidation
  const { invalidateAll } = useSearchInvalidation();

  // === SSE TAIL ===
  const sseUrl = `http://127.0.0.1:9999/api/v2/search/tail?tenant_id=${debouncedTenant}&q=${encodeURIComponent(debouncedQuery || "*")}`;
  
  const { connected: sseConnected, error: sseError } = useSSE({
    url: sseUrl,
    enabled: sseEnabled && !!compileResult?.sql,
    onMessage: (data) => {
      setTailEvents(prev => [data, ...prev.slice(0, 99)]); // Keep last 100 events
    },
    onError: (error) => {
      console.warn('SSE tail error:', error);
    },
    maxReconnectAttempts: 3,
    reconnectInterval: 2000,
  });

  // === EVENT HANDLERS ===

  const handleQueryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  }, []);

  const handleQuerySubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    invalidateAll(); // Force refresh with current (non-debounced) values
  }, [invalidateAll]);

  const handleFacetClick = useCallback((field: string, value: string) => {
    const facetFilter = `${field}:"${value}"`;
    
    if (query.includes(facetFilter)) {
      setQuery(prev => prev.replace(facetFilter, '').replace(/\s+/g, ' ').trim());
    } else {
      setQuery(prev => `${prev} ${facetFilter}`.trim());
    }
  }, [query]);

  const handleRowClick = useCallback((row: TableRow) => {
    setSelectedRowDetails(row);
  }, []);

  const handleRowSelect = useCallback((rows: TableRow[]) => {
    setSelectedRows(rows);
  }, []);

  const handleSseToggle = useCallback(() => {
    setSseEnabled(!sseEnabled);
    if (sseEnabled) {
      setTailEvents([]); // Clear events when disabling
    }
  }, [sseEnabled]);

  // === DERIVED DATA ===

  const tableColumns: TableColumn[] = useMemo(() => {
    if (!executeResult?.data.meta) return [];
    
    return executeResult.data.meta.map(col => ({
      name: col.name,
      type: col.type,
      label: col.name,
      sortable: true,
      width: getColumnWidth(col.name, col.type),
    }));
  }, [executeResult?.data.meta]);

  const tableData: TableRow[] = useMemo(() => {
    return executeResult?.data.data || [];
  }, [executeResult?.data.data]);

  // Chart options using ECharts
  const timelineOption = useMemo(() => {
    if (!timelineResult?.buckets || timelineResult.buckets.length === 0) {
      return null;
    }
    
    return ChartUtils.createTimelineOption(
      timelineResult.buckets,
      `Events Timeline (${timelineResult.buckets.length} data points)`
    );
  }, [timelineResult]);

  // Small multiples for top facets
  const facetChartOptions = useMemo(() => {
    if (!facetsResult?.facets) return [];

    const charts = [];
    
    // Create charts for top 4 facets
    const topFacets = Object.entries(facetsResult.facets)
      .slice(0, 4)
      .filter(([_, values]) => values.length > 0);

    for (const [field, values] of topFacets) {
      const data = values.slice(0, 10).map(v => ({ name: v.value, value: v.count }));
      
      if (data.length > 0) {
        charts.push({
          field,
          option: field === 'severity' || field === 'event_outcome' ? 
            ChartUtils.createPieOption(data, formatFieldName(field)) :
            ChartUtils.createBarOption(data, formatFieldName(field))
        });
      }
    }

    return charts;
  }, [facetsResult]);

  // Status
  const isAnyLoading = isCompiling || isExecuting || isTimelineLoading || isFacetsLoading;
  const hasErrors = !!(compileError || executeError || timelineError || facetsError);
  const mainError = compileError || executeError || timelineError || facetsError;

  // Compute table height safely (avoid direct window usage during initialization)
  const [tableHeight, setTableHeight] = useState<number>(600);
  React.useEffect(() => {
    const compute = () => {
      const base = typeof window !== 'undefined' ? window.innerHeight : 800;
      const offset = selectedRows.length > 0 ? 520 : 490;
      setTableHeight(Math.max(300, base - offset));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [selectedRows.length]);

  return (
    <div className="search-golden-v4" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <div style={{
        padding: '16px',
        background: 'var(--surface, #f8fafc)',
        borderBottom: '1px solid var(--border, #e2e8f0)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: 'var(--fg, #1f2937)' }}>
            🎯 Enterprise Search V4 - Complete
          </h1>
          
          {/* Status Bar */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px' }}>
            {isAnyLoading && <span style={{ color: '#f59e0b' }}>⏳ Loading...</span>}
            {hasErrors && <span style={{ color: '#dc2626' }}>⚠️ {mainError?.message}</span>}
            {compileResult && <span style={{ color: '#10b981' }}>✓ SQL compiled</span>}
            {executeResult && (
              <span style={{ color: '#3b82f6' }}>
                📊 {executeResult.data.data.length.toLocaleString()} rows ({executeResult.took_ms}ms)
              </span>
            )}
            {sseEnabled && (
              <span style={{ color: sseConnected ? '#10b981' : '#dc2626' }}>
                📡 SSE {sseConnected ? 'Connected' : 'Disconnected'} ({tailEvents.length})
              </span>
            )}
          </div>

          {/* Controls */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <CompactSelect
              value={tenantId}
              onChange={(value) => setTenantId(value.toString())}
              size="sm"
              aria-label="Tenant"
              options={[
                { value: "hr", label: "HR Tenant" },
                { value: "default", label: "Default" },
                { value: "finance", label: "Finance" },
              ]}
            />
            
            <CompactSelect
              value={timeSeconds}
              onChange={(value) => setTimeSeconds(parseInt(value.toString()))}
              size="sm"
              aria-label="Time range"
              options={[
                { value: 3600, label: "1 hour" },
                { value: 86400, label: "24 hours" },
                { value: 604800, label: "7 days" },
              ]}
            />

            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="checkbox"
                checked={sseEnabled}
                onChange={handleSseToggle}
                disabled={!compileResult?.sql}
              />
              Real-time Tail
            </label>

            <button
              onClick={() => invalidateAll()}
              style={{ 
                padding: '6px 12px', 
                fontSize: '12px', 
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Query Bar */}
        <form onSubmit={handleQuerySubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Enter search query... (debounced 300ms for smooth typing)"
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              outline: 'none',
              background: 'var(--surface, white)',
              color: 'var(--fg, #1f2937)',
            }}
          />
          <button
            type="submit"
            disabled={isAnyLoading}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              opacity: isAnyLoading ? 0.6 : 1,
            }}
          >
            🔍 Search
          </button>
        </form>

        {/* Compile Status */}
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
          {isCompiling && "🔄 Compiling query..."}
          {compileResult?.sql && !isCompiling && (
            <details>
              <summary style={{ cursor: 'pointer' }}>
                ✅ Query compiled successfully - Click to view SQL
              </summary>
              <pre style={{
                fontSize: '10px',
                background: 'var(--surface-muted, #f3f4f6)',
                padding: '8px',
                borderRadius: '4px',
                overflow: 'auto',
                margin: '4px 0 0 0',
                maxHeight: '100px'
              }}>
                {compileResult.sql}
              </pre>
            </details>
          )}
          {compileError && <span style={{ color: '#dc2626' }}>❌ Compile error: {compileError.message}</span>}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Sidebar - Facets */}
        <div style={{ 
          width: '320px', 
          borderRight: '1px solid var(--border, #e2e8f0)',
          flexShrink: 0,
          background: 'var(--surface, white)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <VirtualizedFacets
            facets={facetsResult?.facets || {}}
            loading={isFacetsLoading}
            error={facetsError}
            onFacetClick={handleFacetClick}
            maxHeight={300}
            itemHeight={36}
          />
          
          {/* SSE Tail Events */}
          {sseEnabled && (
            <div style={{ 
              flex: 1, 
              borderTop: '1px solid var(--border, #e2e8f0)',
              background: 'var(--surface-muted, #f8fafc)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ 
                padding: '8px 12px', 
                fontSize: '12px', 
                fontWeight: '600',
                color: 'var(--fg-muted, #6b7280)',
                borderBottom: '1px solid var(--border, #e2e8f0)'
              }}>
                🔴 Live Events ({tailEvents.length})
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '4px' }}>
                {tailEvents.map((event, i) => (
                  <div key={i} style={{
                    fontSize: '10px',
                    padding: '4px 8px',
                    marginBottom: '2px',
                    background: 'var(--surface, white)',
                    borderRadius: '3px',
                    borderLeft: '2px solid #10b981',
                    fontFamily: 'ui-monospace, monospace'
                  }}>
                    {JSON.stringify(event).slice(0, 100)}...
                  </div>
                ))}
                {tailEvents.length === 0 && (
                  <div style={{ 
                    padding: '20px', 
                    textAlign: 'center', 
                    fontSize: '11px',
                    color: 'var(--fg-muted, #6b7280)'
                  }}>
                    Waiting for events...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center - Charts and Results */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Timeline Chart */}
          <div style={{ 
            height: '250px', 
            borderBottom: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface, white)',
            padding: '8px'
          }}>
            <Chart
              option={timelineOption}
              height={234}
              loading={isTimelineLoading}
              error={timelineError}
              theme="auto"
            />
          </div>

          {/* Small Multiples - Facet Charts */}
          <div style={{
            height: '200px',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface, white)',
            padding: '8px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px'
          }}>
            {facetChartOptions.map(({ field, option }) => (
              <Chart
                key={field}
                option={option}
                height={92}
                loading={isFacetsLoading}
                theme="auto"
              />
            ))}
          </div>

          {/* Results Table */}
          <div style={{ flex: 1, overflow: 'visible' }}>
            {selectedRows.length > 0 && (
              <div style={{
                padding: '8px 16px',
                background: '#dbeafe',
                borderBottom: '1px solid #bfdbfe',
                fontSize: '12px',
                color: '#1e40af',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                📌 {selectedRows.length} row(s) selected
                <button
                  onClick={() => setSelectedRows([])}
                  style={{
                    padding: '2px 6px',
                    fontSize: '11px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
              </div>
            )}
            
            <VirtualizedTable
              columns={tableColumns}
              data={tableData}
              loading={isExecuting}
              error={executeError}
              onRowClick={handleRowClick}
              onRowSelect={handleRowSelect}
              height={tableHeight}
              rowHeight={40}
              enableSelection={true}
              enableSorting={true}
              enableColumnResizing={true}
            />
          </div>
        </div>

        {/* Right Sidebar - Row Details */}
        {selectedRowDetails && (
          <div style={{
            width: '400px',
            borderLeft: '1px solid var(--border, #e2e8f0)',
            background: 'var(--surface-muted, #f8fafc)',
            padding: '16px',
            overflow: 'auto',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--fg, #1f2937)' }}>
                🔍 Event Details
              </h3>
              <button
                onClick={() => setSelectedRowDetails(null)}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  background: '#e5e7eb',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ fontSize: '12px' }}>
              {Object.entries(selectedRowDetails).map(([key, value]) => (
                <div key={key} style={{ marginBottom: '12px' }}>
                  <div style={{ fontWeight: '600', color: 'var(--fg, #374151)', marginBottom: '2px' }}>
                    {key}
                  </div>
                  <div style={{
                    background: 'var(--surface, white)',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border, #d1d5db)',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: '11px',
                    wordBreak: 'break-all',
                    color: 'var(--fg, #1f2937)'
                  }}>
                    {value == null ? '<null>' : String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// === HELPERS ===

function getColumnWidth(name: string, type: string): number {
  if (name.includes('timestamp') || name.includes('time')) return 180;
  if (name.includes('id') || name.includes('uuid')) return 120;
  if (name.includes('ip') || name.includes('address')) return 140;
  if (name.includes('url') || name.includes('path')) return 250;
  if (name.includes('message') || name.includes('description')) return 300;
  if (type.toLowerCase().includes('int') || type.toLowerCase().includes('number')) return 100;
  return 150;
}

function formatFieldName(field: string): string {
  return field
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
