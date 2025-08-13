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
    tenantId: "default",
    query: "*",
    time: { last_seconds: 600 },
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
    <div data-testid="page-search" className="container" style={{ maxWidth: "100%", padding: 0 }}>
      {/* Error Banner */}
      {errorBanner && (
        <div 
          role="alert" 
          data-testid="error-banner"
          style={{
            padding: "10px",
            backgroundColor: "#fef2f2",
            border: "1px solid #f87171",
            borderRadius: "4px",
            color: "#dc2626",
            margin: "10px",
            fontSize: "14px"
          }}
        >
          {errorBanner}
        </div>
      )}
      
      <h2>Search</h2>
      <div style={{ display: "flex", gap: "var(--space-md)", minHeight: "calc(100vh - 64px)" }}>
        {/* Left sidebar */}
        <aside style={{ 
          width: "320px", 
          backgroundColor: "var(--bg-secondary)",
          borderRight: "1px solid var(--border-color)",
          overflowY: "auto"
        }}>
          <SchemaPanel 
            fields={fields} 
            enums={enums} 
            grammar={grammar}
          />
          <FacetPanel facets={state.facets} onToggle={toggleFacet} />
          <SavedSearchBar tenantId={state.tenantId} onLoad={loadSavedSearch} />
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", padding: "var(--space-lg)" }}>
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

        {/* Compile result */}
        {state.compile && (
          <div data-testid="compile-sql" style={{ padding: "10px", background: "#f5f5f5" }}>
            <div>SQL (server-generated)</div>
            <pre>{state.compile.sql}</pre>
            {state.compile.warnings.length > 0 && (
              <div style={{ color: "orange" }}>
                Warnings: {state.compile.warnings.join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Errors */}
        {state.errors.length > 0 && (
          <div style={{ padding: "10px", background: "#fee", color: "#c00" }}>
            {state.errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
            <button onClick={clearErrors}>Clear</button>
          </div>
        )}

        {/* Timeline */}
        {state.timeline && (
          <TimelineChart
            buckets={state.timeline}
            onBrush={(from, to) => updateTime({ from, to })}
          />
        )}

        {/* SSE switch */}
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

        {/* Results */}
        {state.execute && (
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
        )}
        </main>
      </div>
    </div>
  );
}
