import { useState, useEffect, useCallback, useRef } from "react";
import QueryBar from "../components/search-golden/QueryBar";
import FacetPanel from "../components/search-golden/FacetPanel";
import ResultTable from "../components/search-golden/ResultTable";
import SavedSearchBar from "../components/search-golden/SavedSearchBar";
import SchemaPanel from "../components/search-golden/SchemaPanel";
import { 
  fetchSchemaFields,
  fetchEnums,
  compileQuery, 
  executeQuery, 
  fetchTimeline, 
  fetchFacets 
} from "../lib/api-golden";
import * as Types from "../lib/search-types";

// Global API declaration for legacy compatibility
declare global {
  const api: any;
}

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
  useEffect(() => {
    loadSchema();
  }, []);

  // Auto-fetch latest 100 events on mount
  useEffect(() => {
    // Execute search with initial state (empty query = match all, last 24h, limit 100)
    // Only run once on mount
    const timer = setTimeout(() => {
      execute();
    }, 500); // Small delay to ensure component is fully mounted

    return () => clearTimeout(timer);
  }, []); // Empty dependency array - run only once

  const loadSchema = async (_signal?: AbortSignal) => {
    try {
      // Load schema fields and enums in parallel
      const [fieldsResult, enumsResult] = await Promise.allSettled([
        fetchSchemaFields(),
        fetchEnums()
      ]);

      // Handle fields result
      if (fieldsResult.status === "fulfilled") {
        setFields(fieldsResult.value || []);
      } else {
        console.warn("Failed to load schema fields:", fieldsResult.reason);
        setFields([]); // Safe fallback
      }

      // Handle enums result
      if (enumsResult.status === "fulfilled") {
        setEnums(enumsResult.value || {});
      } else {
        console.warn("Failed to load enums:", enumsResult.reason);
        setEnums({}); // Safe fallback
      }

      // Set basic grammar (these could come from API in future)
      setGrammar({
        keywords: ["AND", "OR", "NOT", "EXISTS", "MISSING", "RANGE"],
        operators: [":", "=", "!=", ">", "<", ">=", "<=", "~", "!~"],
        functions: ["count", "sum", "avg", "min", "max", "distinct"],
        specials: ["*", "?", "\\", "(", ")", "[", "]", "{", "}"],
        examples: [],
        tokens: [
          { label: "field:value", example: "host:server1" },
          { label: "field:\"exact phrase\"", example: "message:\"login failed\"" },
          { label: "field:>value", example: "port:>8080" },
          { label: "wildcard", example: "*.example.com" }
        ]
      });

    } catch (error) {
      console.error("Error loading schema:", error);
      // Set safe fallbacks
      setFields([]);
      setEnums({});
      setGrammar({ tokens: [], functions: [], keywords: [], operators: [], specials: [], examples: [] });
    }
  };

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
          execute: executeRes as Types.ExecuteResult,
          facets: (facetsRes as any)?.facets || {},
          timeline: (timelineRes as any)?.buckets || [],
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
          execute: { 
            data: { 
              data: [], 
              meta: [],
              rows: 0,
              rows_before_limit_at_least: 0,
              statistics: {}
            }, 
            sql: '', 
            took_ms: 0 
          },
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

  // SSE status update (not currently used)
  // const updateSSEStatus = (connected: boolean, lastEventTs?: number) => {
  //   setState((prev: Types.SearchState) => ({ 
  //     ...prev, 
  //     sse: { ...prev.sse, connected, lastEventTs } 
  //   }));
  // };

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
      backgroundColor: "var(--bg)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: "var(--card)",
        borderBottom: "1px solid var(--border)",
        padding: "8px 16px",
        boxShadow: "var(--shadow-1)",
        zIndex: 10
      }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: "16px", 
          fontWeight: 600, 
          color: "var(--fg)" 
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
            backgroundColor: "var(--destructive-bg)",
            border: "1px solid var(--destructive-border)",
            borderLeft: "4px solid var(--destructive)",
            color: "var(--destructive)",
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
        backgroundColor: "var(--border)"
      }}>
        {/* Left sidebar - Collapsible */}
        <aside style={{ 
          width: "240px", 
          backgroundColor: "var(--card)",
          overflowY: "auto",
          flexShrink: 0,
          borderRadius: "0 4px 4px 0"
        }}>
          <div style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--muted)"
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: "11px", 
              fontWeight: 600, 
              color: "var(--fg-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.3px"
            }}>
              Controls
            </h3>
          </div>
          <SchemaPanel 
            fields={fields} 
            enums={enums} 
            grammar={grammar}
            onFieldClick={(fieldName) => {
              // Add field to query with a colon, ready for user to add value
              const newQuery = state.query === "*" || !state.query 
                ? `${fieldName}:` 
                : `${state.query} AND ${fieldName}:`;
              updateQuery(newQuery);
            }}
            onEnumClick={(fieldName, enumValue) => {
              // Add field:value filter to query
              const newQuery = state.query === "*" || !state.query
                ? `${fieldName}:"${enumValue}"`
                : `${state.query} AND ${fieldName}:"${enumValue}"`;
              updateQuery(newQuery);
            }}
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
          onExport={() => exportSearch('csv')}
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
            padding: "0 8px 8px 8px"
          }}>
            {/* Compact SQL indicator - minimal */}
            {state.compile && (
              <div data-testid="compile-sql" style={{
                backgroundColor: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "3px",
                marginBottom: "4px",
                padding: "2px 6px",
                fontSize: "9px",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}>
                SQL Ready
                {state.compile.warnings.length > 0 && (
                  <span style={{
                    backgroundColor: "#f59e0b",
                    color: "white",
                    padding: "1px 3px",
                    borderRadius: "2px",
                    fontSize: "8px"
                  }}>
                    {state.compile.warnings.length}
                  </span>
                )}
                <details style={{ fontSize: "8px" }}>
                  <summary style={{ cursor: "pointer" }}>View</summary>
                  <pre style={{
                    margin: "2px 0 0 0",
                    fontSize: "8px",
                    fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
                    backgroundColor: "white",
                    padding: "4px",
                    borderRadius: "2px",
                    border: "1px solid #e2e8f0",
                    overflow: "auto",
                    maxHeight: "60px",
                    maxWidth: "400px"
                  }}>
                    {state.compile.sql}
                  </pre>
                </details>
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
            {/* Compact indicators row */}
            <div style={{ 
              display: "flex", 
              gap: "6px", 
              alignItems: "center", 
              marginBottom: "4px", 
              fontSize: "9px",
              color: "#64748b" 
            }}>
              {/* Timeline indicator */}
              {state.timeline && state.timeline.length > 0 && (
                <div style={{
                  backgroundColor: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: "2px",
                  padding: "2px 4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "2px"
                }}>
                  Timeline ({state.timeline.length})
                </div>
              )}

              {/* Compact Real-time indicator */}
              <div style={{
                backgroundColor: state.sse.connected ? "#dcfce7" : "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "2px",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
                gap: "2px"
              }}>
                Live: {state.sse.connected ? "ON" : "OFF"}
                <button
                  onClick={() => toggleSSE(!state.sse.enabled)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "8px",
                    cursor: "pointer",
                    padding: "1px 2px"
                  }}
                >
                  {state.sse.enabled ? "Stop" : "Start"}
                </button>
              </div>
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
              {/* Compact Results header - PROMINENT */}
              <div style={{
                padding: "6px 12px",
                borderBottom: "1px solid #e2e8f0",
                backgroundColor: "#f8fafc",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  Search Results
                  {state.execute ? (
                    <span style={{ 
                      fontSize: "13px", 
                      color: "#059669",
                      fontWeight: 600
                    }}>
                      {state.execute.data.rows?.toLocaleString() || 0} events 
                      {state.execute.data.rows_before_limit_at_least && 
                       state.execute.data.rows_before_limit_at_least > (state.execute.data.rows || 0) && 
                       ` (${state.execute.data.rows_before_limit_at_least.toLocaleString()} total, limited)`}
                      {state.execute.took_ms && ` • ${state.execute.took_ms}ms`}
                    </span>
                  ) : (
                    <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 400 }}>
                      Click 'Run' to search events
                    </span>
                  )}
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
              <div style={{ flex: 1, overflow: "visible" }}>
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
                    <div style={{ fontSize: "24px", marginBottom: "16px", fontWeight: "600" }}>Search</div>
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
