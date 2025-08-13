import { useState, useEffect, useCallback, useRef } from "react";
import QueryBar from "../components/search-golden/QueryBar";
import FacetPanel from "../components/search-golden/FacetPanel";
import TimelineChart from "../components/search-golden/TimelineChart";
import ResultTable from "../components/search-golden/ResultTable";
import SavedSearchBar from "../components/search-golden/SavedSearchBar";
import StreamSwitch from "../components/search-golden/StreamSwitch";
import SchemaPanel from "../components/search-golden/SchemaPanel";
import { 
  // fetchSchemaFields,
  // fetchEnums,
  compileQuery, 
  executeQuery, 
  fetchTimeline, 
  fetchFacets 
} from "../lib/api-golden";
import * as Types from "../lib/search-types";

/**
 * SearchPage - Golden Standard Implementation
 * Owns global search state; coordinates all child components
 */
export default function SearchPage() {
  // Core search state
  const [state, setState] = useState<Types.SearchState>({
    tenantId: "hr", // Use tenant with most data for initial load
    query: "",
    time: { last_seconds: 86400 }, // 24 hours for initial load
    limit: 100,
    sort: [{ field: "event_timestamp", dir: "desc" }],
    sse: { enabled: false, connected: false },
    saving: false,
    exporting: false,
    errors: [],
  });

  // Schema state - separate states for defensive handling
  const [fields, setFields] = useState<Types.FieldMeta[] | null>([]);
  const [enums, setEnums] = useState<Record<string, string[]> | null>({});
  const [grammar, setGrammar] = useState<Types.Grammar | null>({ tokens: [], functions: [], examples: [], keywords: [], operators: [], specials: [] });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Refs
  const compileTimer = useRef<NodeJS.Timeout | null>(null);
  const abortController = useRef<AbortController | null>(null);

  // Load schema on mount - defensively
  // MVP: Skip schema/grammar fetch entirely
  useEffect(() => { /* no-op */ }, []);

  // Auto-fetch latest 100 events on mount
  useEffect(() => {
    // Execute search with initial state (empty query = match all, last 24h, limit 100)
    // Only run once on mount
    const timer = setTimeout(() => {
      execute();
    }, 500); // Small delay to ensure component is fully mounted

    return () => clearTimeout(timer);
  }, []); // Empty dependency array - run only once

  const loadSchema = async (_signal?: AbortSignal) => {};

  // Error handling
  const addError = (error: string) => {
    setState((prev: Types.SearchState) => ({ ...prev, errors: [...prev.errors, error] }));
  };

  const clearErrors = () => {
    setState((prev: Types.SearchState) => ({ ...prev, errors: [] }));
  };

  // Compile (debounced) - safe with error handling
  const [compiling, setCompiling] = useState(false);
  const [running, setRunning] = useState(false);

  const compile = useCallback(async () => {
    if (compileTimer.current) clearTimeout(compileTimer.current);
    compileTimer.current = setTimeout(async () => {
      try {
        setErrorBanner(null);
        setCompiling(true);
        // Normalize query: treat * and empty as match-all
        const qNorm = state.query.trim();
        const qForApi = qNorm === '' || qNorm === '*' ? '' : qNorm;
        
        const result = await compileQuery({
          tenant_id: state.tenantId,
          time: state.time,
          q: qForApi,
        });
        setState((prev: Types.SearchState) => ({ ...prev, compile: result }));
      } catch (err: any) {
        const message = err?.message || 'Compile failed';
        setErrorBanner(`Compile failed: ${message}`);
        // Set safe default for compile result
        setState((prev: Types.SearchState) => ({ 
          ...prev, 
          compile: { sql: '', warnings: [message], where_sql: '' }
        }));
      } finally { setCompiling(false); }
    }, 300);
  }, [state.tenantId, state.time, state.query]);

  // Execute search - safe with error handling
  const execute = useCallback(async () => {
    // Cancel any in-flight request
    abortController.current?.abort();
    abortController.current = new AbortController();

    clearErrors();
    setErrorBanner(null);

    try {
      setRunning(true);
      
      // Feature flags for optional endpoints
      const FACETS_ENABLED = true; // Can be disabled if endpoint is broken
      const TIMELINE_ENABLED = false; // Disabled until backend implements it

      // Normalize query: treat * and empty as match-all
      const qNorm = state.query.trim();
      const qForApi = qNorm === '' || qNorm === '*' ? '' : qNorm;

      // Build tasks array with optional endpoints
      const tasks = [
        // Required: execute (core functionality)
        executeQuery({
          tenant_id: state.tenantId,
          time: state.time,
          q: qForApi,
          limit: state.limit,
          sort: state.sort,
        }),
        // Optional: facets (graceful degradation)
        FACETS_ENABLED ? fetchFacets({
          tenant_id: state.tenantId,
          time: state.time,
          q: qForApi,
          facets: [
            { field: "event_type", size: 10 },
            { field: "severity", size: 5 },
            { field: "host", size: 5 },
          ],
        }, abortController.current.signal) : Promise.resolve({ facets: {} }),
        // Optional: timeline (graceful degradation)
        TIMELINE_ENABLED ? fetchTimeline({
          tenant_id: state.tenantId,
          time: state.time,
          q: qForApi,
          interval_ms: 60000,
        }, abortController.current.signal) : Promise.resolve({ buckets: [] }),
      ];

      const [executeResult, facetsResult, timelineResult] = await Promise.allSettled(tasks);

      if (!abortController.current.signal.aborted) {
        // Extract results, using fallbacks for failed optional calls
        const executeRes = executeResult.status === 'fulfilled' ? executeResult.value : 
          { data: { data: [], meta: [] }, sql: "", took_ms: 0 };
        
        const facetsRes = facetsResult.status === 'fulfilled' ? facetsResult.value : { facets: {} };
        const timelineRes = timelineResult.status === 'fulfilled' ? timelineResult.value : { buckets: [] };

        setState((prev: Types.SearchState) => ({
          ...prev,
          execute: executeRes,
          facets: facetsRes.facets || {},
          timeline: timelineRes.buckets || [],
        }));

        // Log optional endpoint failures for debugging (but don't crash UI)
        if (facetsResult.status === 'rejected') {
          console.warn('Facets endpoint failed (non-critical):', facetsResult.reason);
        }
        if (timelineResult.status === 'rejected') {
          console.warn('Timeline endpoint failed (non-critical):', timelineResult.reason);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !abortController.current?.signal.aborted) {
        const message = err?.message || 'Execute failed';
        setErrorBanner(`Execute failed: ${message}`);
        // Set safe defaults
        setState((prev: Types.SearchState) => ({
          ...prev,
          execute: { data: { data: [], meta: [] }, sql: '', took_ms: 0 },
          facets: {},
          timeline: [],
        }));
      }
    } finally { setRunning(false); }
  }, [state.tenantId, state.time, state.query, state.limit, state.sort]);

  // Update handlers
  const updateQuery = (query: string) => {
    setState((prev: Types.SearchState) => ({ ...prev, query }));
    compile();
  };

  const updateTime = (time: Types.TimeRange) => {
    setState((prev: Types.SearchState) => ({ ...prev, time }));
    compile();
  };

  const updateTenant = (tenantId: string) => {
    setState((prev: Types.SearchState) => ({ ...prev, tenantId }));
    compile();
  };

  const updateSort = (sort: Types.SortSpec[]) => {
    setState((prev: Types.SearchState) => ({ ...prev, sort }));
  };

  const updateLimit = (limit: number) => {
    setState((prev: Types.SearchState) => ({ ...prev, limit }));
  };

  const toggleFacet = (field: string, value: string) => {
    const newQuery = state.query === "*" 
      ? `${field}:${value}`
      : `${state.query} AND ${field}:${value}`;
    updateQuery(newQuery);
  };

  const toggleSSE = (enabled: boolean) => {
    setState((prev: Types.SearchState) => ({ ...prev, sse: { ...prev.sse, enabled } }));
  };

  const updateSSEStatus = (connected: boolean, lastEventTs?: number) => {
    setState((prev: Types.SearchState) => ({ 
      ...prev, 
      sse: { ...prev.sse, connected, lastEventTs } 
    }));
  };

  // Save search
  const saveSearch = async (name: string) => {
    setState((prev: Types.SearchState) => ({ ...prev, saving: true }));
    try {
      await api.saved.create({
        tenant_id: state.tenantId,
        name,
        query: state.query,
        time: state.time,
        options: { limit: state.limit },
      });
    } catch (err: any) {
      addError(err.error || "Save failed");
    } finally {
      setState((prev: Types.SearchState) => ({ ...prev, saving: false }));
    }
  };

  // Export search
  const exportSearch = async (format: "csv" | "ndjson" | "parquet") => {
    setState((prev: Types.SearchState) => ({ ...prev, exporting: true }));
    try {
      const res = await api.exports.create({
        tenant_id: state.tenantId,
        time: state.time,
        q: state.query,
        format,
      });
      
      // Poll for completion
      const pollExport = async () => {
        const status = await api.exports.get(res.export_id);
        if (status.status === "ready" && status.download_url) {
          window.open(status.download_url, "_blank");
        } else if (status.status === "failed") {
          addError("Export failed");
        } else {
          setTimeout(pollExport, 2000);
        }
      };
      
      setTimeout(pollExport, 1000);
    } catch (err: any) {
      addError(err.error || "Export failed");
    } finally {
      setState((prev: Types.SearchState) => ({ ...prev, exporting: false }));
    }
  };

  // Load saved search
  const loadSavedSearch = (saved: Types.SavedSearch) => {
    setState((prev: Types.SearchState) => ({
      ...prev,
      query: saved.q,
      time: saved.time,
      limit: saved.options?.limit || 100,
    }));
    compile();
  };

  // Initial compile on mount
  useEffect(() => {
    compile();
  }, []);

  return (
    <div data-testid="page-search" style={{ 
      height: "100vh", 
      display: "flex", 
      flexDirection: "column",
      backgroundColor: "#f8fafc",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 24px",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        zIndex: 10
      }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: "24px", 
          fontWeight: 600, 
          color: "#1e293b" 
        }}>
          Search Events
        </h1>
      </header>

      {/* Error Banner */}
      {errorBanner && (
        <div 
          role="alert" 
          data-testid="error-banner"
          style={{
            padding: "12px 24px",
            backgroundColor: "#fef2f2",
            border: "1px solid #fca5a5",
            borderLeft: "4px solid #ef4444",
            color: "#dc2626",
            fontSize: "14px",
            margin: "8px 24px"
          }}
        >
          <strong>Error:</strong> {errorBanner}
        </div>
      )}
      
      <div style={{ 
        display: "flex", 
        flex: 1, 
        overflow: "hidden",
        gap: "1px",
        backgroundColor: "#e2e8f0"
      }}>
        {/* Left sidebar - Collapsible */}
        <aside style={{ 
          width: "300px", 
          backgroundColor: "#ffffff",
          overflowY: "auto",
          flexShrink: 0,
          borderRadius: "0 8px 8px 0"
        }}>
          <div style={{
            padding: "16px",
            borderBottom: "1px solid #f1f5f9",
            backgroundColor: "#f8fafc"
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: "14px", 
              fontWeight: 600, 
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Search Controls
            </h3>
          </div>
          <SchemaPanel 
            fields={fields} 
            enums={enums} 
            grammar={grammar}
          />
          <FacetPanel facets={state.facets} onToggle={toggleFacet} />
          <SavedSearchBar tenantId={state.tenantId} onLoad={loadSavedSearch} />
        </aside>

        {/* Main content area */}
        <main style={{ 
          flex: 1, 
          display: "flex", 
          flexDirection: "column", 
          overflow: "hidden",
          backgroundColor: "#ffffff",
          borderRadius: "8px 0 0 8px"
        }}>
        {/* Query bar */}
        <QueryBar
          tenantId={state.tenantId}
          query={state.query}
          time={state.time}
          onTenantChange={updateTenant}
          onQueryChange={updateQuery}
          onTimeChange={updateTime}
          onCompile={compile}
          onRun={execute}
          onSave={saveSearch}
          onExport={exportSearch}
          saving={state.saving}
          exporting={state.exporting}
          compiling={compiling}
          running={running}
        />

          {/* Main content panels */}
          <div style={{ 
            flex: 1, 
            display: "flex", 
            flexDirection: "column", 
            overflow: "hidden",
            padding: "0 24px 16px 24px"
          }}>
            {/* SQL compilation panel */}
            {state.compile && (
              <div data-testid="compile-sql" style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                marginBottom: "16px",
                overflow: "hidden"
              }}>
                <div style={{
                  padding: "12px 16px",
                  backgroundColor: "#64748b",
                  color: "white",
                  fontSize: "13px",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  🔧 Generated SQL
                  {state.compile.warnings.length > 0 && (
                    <span style={{
                      backgroundColor: "#f59e0b",
                      color: "white",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "11px"
                    }}>
                      {state.compile.warnings.length} warnings
                    </span>
                  )}
                </div>
                <div style={{ padding: "16px" }}>
                  <pre style={{
                    margin: 0,
                    fontSize: "12px",
                    fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
                    backgroundColor: "white",
                    padding: "12px",
                    borderRadius: "6px",
                    border: "1px solid #e2e8f0",
                    overflow: "auto",
                    maxHeight: "200px"
                  }}>
                    {state.compile.sql}
                  </pre>
                  {state.compile.warnings.length > 0 && (
                    <div style={{
                      marginTop: "12px",
                      padding: "8px 12px",
                      backgroundColor: "#fef3c7",
                      borderRadius: "6px",
                      fontSize: "12px",
                      color: "#92400e"
                    }}>
                      ⚠️ Warnings: {state.compile.warnings.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error panel */}
            {state.errors.length > 0 && (
              <div style={{
                backgroundColor: "#fef2f2",
                border: "1px solid #fca5a5",
                borderLeft: "4px solid #ef4444",
                borderRadius: "8px",
                padding: "12px 16px",
                marginBottom: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start"
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#dc2626", marginBottom: "8px" }}>
                    🚨 Errors ({state.errors.length})
                  </div>
                  {state.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: "14px", color: "#dc2626", marginBottom: "4px" }}>
                      {err}
                    </div>
                  ))}
                </div>
                <button 
                  onClick={clearErrors}
                  style={{
                    backgroundColor: "transparent",
                    border: "1px solid #dc2626",
                    color: "#dc2626",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer"
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            {/* Timeline visualization */}
            {state.timeline && (
              <div style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                marginBottom: "16px",
                overflow: "hidden"
              }}>
                <div style={{
                  padding: "12px 16px",
                  backgroundColor: "#f8fafc",
                  borderBottom: "1px solid #f1f5f9",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#1e293b"
                }}>
                  📈 Event Timeline
                </div>
                <div style={{ padding: "16px" }}>
                  <TimelineChart
                    buckets={state.timeline}
                    onBrush={(from, to) => updateTime({ from, to })}
                  />
                </div>
              </div>
            )}

            {/* Real-time controls */}
            <div style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "#1e293b" }}>
                🔄 Real-time Updates
              </div>
              <StreamSwitch
                enabled={state.sse.enabled}
                connected={state.sse.connected}
                lastEventTs={state.sse.lastEventTs}
                onToggle={toggleSSE}
                tenantId={state.tenantId}
                query={state.query}
                time={state.time}
                onStatusUpdate={updateSSEStatus}
              />
            </div>

            {/* Results section */}
            <div style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}>
              {/* Results header */}
              <div style={{
                padding: "16px 20px",
                borderBottom: "1px solid #f1f5f9",
                backgroundColor: "#f8fafc",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: "16px", 
                    fontWeight: 600, 
                    color: "#1e293b" 
                  }}>
                    🔍 Search Results
                  </h3>
                  <div style={{ 
                    fontSize: "13px", 
                    color: "#64748b",
                    marginTop: "4px"
                  }}>
                    {state.execute ? (
                      <>
                        📊 {state.execute.data.rows?.toLocaleString() || 0} events 
                        {state.execute.data.rows_before_limit_at_least && 
                         state.execute.data.rows_before_limit_at_least > (state.execute.data.rows || 0) && 
                         ` (${state.execute.data.rows_before_limit_at_least.toLocaleString()} total, limited)`}
                        {state.execute.took_ms && ` • ⚡ ${state.execute.took_ms}ms`}
                      </>
                    ) : (
                      "Click 'Run' to search events"
                    )}
                  </div>
                </div>
                {state.sse.connected && (
                  <div style={{
                    fontSize: "12px",
                    color: "#10b981",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    🟢 Live
                  </div>
                )}
              </div>

              {/* Results table */}
              <div style={{ flex: 1, overflow: "hidden" }}>
                {state.execute ? (
                  <ResultTable
                    data={state.execute.data.data}
                    meta={state.execute.data.meta}
                    rows={state.execute.data.rows}
                    rowsBeforeLimit={state.execute.data.rows_before_limit_at_least}
                    statistics={state.execute.data.statistics}
                    sort={state.sort}
                    onSort={updateSort}
                    limit={state.limit}
                    onLimitChange={updateLimit}
                  />
                ) : (
                  <div style={{
                    padding: "40px 20px",
                    textAlign: "center",
                    color: "#64748b"
                  }}>
                    <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
                    <div style={{ fontSize: "16px", fontWeight: 500, marginBottom: "8px" }}>
                      Ready to Search
                    </div>
                    <div style={{ fontSize: "14px" }}>
                      Enter your search query above and click "Run" to view events
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
