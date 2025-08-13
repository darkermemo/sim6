import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
compileQuery, executeQuery, fetchTimeline, fetchFacets } from "../lib/api-golden";
/**
 * SearchPage - Golden Standard Implementation
 * Owns global search state; coordinates all child components
 */
export default function SearchPage() {
    // Core search state
    const [state, setState] = useState({
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
    const [fields, setFields] = useState([]);
    const [enums, setEnums] = useState({});
    const [grammar, setGrammar] = useState({ tokens: [], functions: [], examples: [], keywords: [], operators: [], specials: [] });
    const [errorBanner, setErrorBanner] = useState(null);
    // Refs
    const compileTimer = useRef(null);
    const abortController = useRef(null);
    // Load schema on mount - defensively
    // MVP: Skip schema/grammar fetch entirely
    useEffect(() => { }, []);
    // Auto-fetch latest 100 events on mount
    useEffect(() => {
        // Execute search with initial state (empty query = match all, last 24h, limit 100)
        // Only run once on mount
        const timer = setTimeout(() => {
            execute();
        }, 500); // Small delay to ensure component is fully mounted
        return () => clearTimeout(timer);
    }, []); // Empty dependency array - run only once
    const loadSchema = async (_signal) => { };
    // Error handling
    const addError = (error) => {
        setState((prev) => ({ ...prev, errors: [...prev.errors, error] }));
    };
    const clearErrors = () => {
        setState((prev) => ({ ...prev, errors: [] }));
    };
    // Compile (debounced) - safe with error handling
    const [compiling, setCompiling] = useState(false);
    const [running, setRunning] = useState(false);
    const compile = useCallback(async () => {
        if (compileTimer.current)
            clearTimeout(compileTimer.current);
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
                setState((prev) => ({ ...prev, compile: result }));
            }
            catch (err) {
                const message = err?.message || 'Compile failed';
                setErrorBanner(`Compile failed: ${message}`);
                // Set safe default for compile result
                setState((prev) => ({
                    ...prev,
                    compile: { sql: '', warnings: [message], where_sql: '' }
                }));
            }
            finally {
                setCompiling(false);
            }
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
                setState((prev) => ({
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
        }
        catch (err) {
            if (err.name !== 'AbortError' && !abortController.current?.signal.aborted) {
                const message = err?.message || 'Execute failed';
                setErrorBanner(`Execute failed: ${message}`);
                // Set safe defaults
                setState((prev) => ({
                    ...prev,
                    execute: { data: { data: [], meta: [] }, sql: '', took_ms: 0 },
                    facets: {},
                    timeline: [],
                }));
            }
        }
        finally {
            setRunning(false);
        }
    }, [state.tenantId, state.time, state.query, state.limit, state.sort]);
    // Update handlers
    const updateQuery = (query) => {
        setState((prev) => ({ ...prev, query }));
        compile();
    };
    const updateTime = (time) => {
        setState((prev) => ({ ...prev, time }));
        compile();
    };
    const updateTenant = (tenantId) => {
        setState((prev) => ({ ...prev, tenantId }));
        compile();
    };
    const updateSort = (sort) => {
        setState((prev) => ({ ...prev, sort }));
    };
    const updateLimit = (limit) => {
        setState((prev) => ({ ...prev, limit }));
    };
    const toggleFacet = (field, value) => {
        const newQuery = state.query === "*"
            ? `${field}:${value}`
            : `${state.query} AND ${field}:${value}`;
        updateQuery(newQuery);
    };
    const toggleSSE = (enabled) => {
        setState((prev) => ({ ...prev, sse: { ...prev.sse, enabled } }));
    };
    const updateSSEStatus = (connected, lastEventTs) => {
        setState((prev) => ({
            ...prev,
            sse: { ...prev.sse, connected, lastEventTs }
        }));
    };
    // Save search
    const saveSearch = async (name) => {
        setState((prev) => ({ ...prev, saving: true }));
        try {
            await api.saved.create({
                tenant_id: state.tenantId,
                name,
                query: state.query,
                time: state.time,
                options: { limit: state.limit },
            });
        }
        catch (err) {
            addError(err.error || "Save failed");
        }
        finally {
            setState((prev) => ({ ...prev, saving: false }));
        }
    };
    // Export search
    const exportSearch = async (format) => {
        setState((prev) => ({ ...prev, exporting: true }));
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
                }
                else if (status.status === "failed") {
                    addError("Export failed");
                }
                else {
                    setTimeout(pollExport, 2000);
                }
            };
            setTimeout(pollExport, 1000);
        }
        catch (err) {
            addError(err.error || "Export failed");
        }
        finally {
            setState((prev) => ({ ...prev, exporting: false }));
        }
    };
    // Load saved search
    const loadSavedSearch = (saved) => {
        setState((prev) => ({
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
    return (_jsxs("div", { "data-testid": "page-search", style: {
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#f8fafc",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        }, children: [_jsx("header", { style: {
                    backgroundColor: "#ffffff",
                    borderBottom: "1px solid #e2e8f0",
                    padding: "16px 24px",
                    boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
                    zIndex: 10
                }, children: _jsx("h1", { style: {
                        margin: 0,
                        fontSize: "24px",
                        fontWeight: 600,
                        color: "#1e293b"
                    }, children: "Search Events" }) }), errorBanner && (_jsxs("div", { role: "alert", "data-testid": "error-banner", style: {
                    padding: "12px 24px",
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fca5a5",
                    borderLeft: "4px solid #ef4444",
                    color: "#dc2626",
                    fontSize: "14px",
                    margin: "8px 24px"
                }, children: [_jsx("strong", { children: "Error:" }), " ", errorBanner] })), _jsxs("div", { style: {
                    display: "flex",
                    flex: 1,
                    overflow: "hidden",
                    gap: "1px",
                    backgroundColor: "#e2e8f0"
                }, children: [_jsxs("aside", { style: {
                            width: "300px",
                            backgroundColor: "#ffffff",
                            overflowY: "auto",
                            flexShrink: 0,
                            borderRadius: "0 8px 8px 0"
                        }, children: [_jsx("div", { style: {
                                    padding: "16px",
                                    borderBottom: "1px solid #f1f5f9",
                                    backgroundColor: "#f8fafc"
                                }, children: _jsx("h3", { style: {
                                        margin: 0,
                                        fontSize: "14px",
                                        fontWeight: 600,
                                        color: "#64748b",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.5px"
                                    }, children: "Search Controls" }) }), _jsx(SchemaPanel, { fields: fields, enums: enums, grammar: grammar }), _jsx(FacetPanel, { facets: state.facets, onToggle: toggleFacet }), _jsx(SavedSearchBar, { tenantId: state.tenantId, onLoad: loadSavedSearch })] }), _jsxs("main", { style: {
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                            backgroundColor: "#ffffff",
                            borderRadius: "8px 0 0 8px"
                        }, children: [_jsx(QueryBar, { tenantId: state.tenantId, query: state.query, time: state.time, onTenantChange: updateTenant, onQueryChange: updateQuery, onTimeChange: updateTime, onCompile: compile, onRun: execute, onSave: saveSearch, onExport: exportSearch, saving: state.saving, exporting: state.exporting, compiling: compiling, running: running }), _jsxs("div", { style: {
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    overflow: "hidden",
                                    padding: "0 24px 16px 24px"
                                }, children: [state.compile && (_jsxs("div", { "data-testid": "compile-sql", style: {
                                            backgroundColor: "#f8fafc",
                                            border: "1px solid #e2e8f0",
                                            borderRadius: "8px",
                                            marginBottom: "16px",
                                            overflow: "hidden"
                                        }, children: [_jsxs("div", { style: {
                                                    padding: "12px 16px",
                                                    backgroundColor: "#64748b",
                                                    color: "white",
                                                    fontSize: "13px",
                                                    fontWeight: 500,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "8px"
                                                }, children: ["\uD83D\uDD27 Generated SQL", state.compile.warnings.length > 0 && (_jsxs("span", { style: {
                                                            backgroundColor: "#f59e0b",
                                                            color: "white",
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                            fontSize: "11px"
                                                        }, children: [state.compile.warnings.length, " warnings"] }))] }), _jsxs("div", { style: { padding: "16px" }, children: [_jsx("pre", { style: {
                                                            margin: 0,
                                                            fontSize: "12px",
                                                            fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
                                                            backgroundColor: "white",
                                                            padding: "12px",
                                                            borderRadius: "6px",
                                                            border: "1px solid #e2e8f0",
                                                            overflow: "auto",
                                                            maxHeight: "200px"
                                                        }, children: state.compile.sql }), state.compile.warnings.length > 0 && (_jsxs("div", { style: {
                                                            marginTop: "12px",
                                                            padding: "8px 12px",
                                                            backgroundColor: "#fef3c7",
                                                            borderRadius: "6px",
                                                            fontSize: "12px",
                                                            color: "#92400e"
                                                        }, children: ["\u26A0\uFE0F Warnings: ", state.compile.warnings.join(", ")] }))] })] })), state.errors.length > 0 && (_jsxs("div", { style: {
                                            backgroundColor: "#fef2f2",
                                            border: "1px solid #fca5a5",
                                            borderLeft: "4px solid #ef4444",
                                            borderRadius: "8px",
                                            padding: "12px 16px",
                                            marginBottom: "16px",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "start"
                                        }, children: [_jsxs("div", { children: [_jsxs("div", { style: { fontWeight: 600, color: "#dc2626", marginBottom: "8px" }, children: ["\uD83D\uDEA8 Errors (", state.errors.length, ")"] }), state.errors.map((err, i) => (_jsx("div", { style: { fontSize: "14px", color: "#dc2626", marginBottom: "4px" }, children: err }, i)))] }), _jsx("button", { onClick: clearErrors, style: {
                                                    backgroundColor: "transparent",
                                                    border: "1px solid #dc2626",
                                                    color: "#dc2626",
                                                    padding: "4px 8px",
                                                    borderRadius: "4px",
                                                    fontSize: "12px",
                                                    cursor: "pointer"
                                                }, children: "Clear" })] })), state.timeline && (_jsxs("div", { style: {
                                            backgroundColor: "#ffffff",
                                            border: "1px solid #e2e8f0",
                                            borderRadius: "8px",
                                            marginBottom: "16px",
                                            overflow: "hidden"
                                        }, children: [_jsx("div", { style: {
                                                    padding: "12px 16px",
                                                    backgroundColor: "#f8fafc",
                                                    borderBottom: "1px solid #f1f5f9",
                                                    fontSize: "14px",
                                                    fontWeight: 600,
                                                    color: "#1e293b"
                                                }, children: "\uD83D\uDCC8 Event Timeline" }), _jsx("div", { style: { padding: "16px" }, children: _jsx(TimelineChart, { buckets: state.timeline, onBrush: (from, to) => updateTime({ from, to }) }) })] })), _jsxs("div", { style: {
                                            backgroundColor: "#ffffff",
                                            border: "1px solid #e2e8f0",
                                            borderRadius: "8px",
                                            padding: "12px 16px",
                                            marginBottom: "16px",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center"
                                        }, children: [_jsx("div", { style: { fontSize: "14px", fontWeight: 500, color: "#1e293b" }, children: "\uD83D\uDD04 Real-time Updates" }), _jsx(StreamSwitch, { enabled: state.sse.enabled, connected: state.sse.connected, lastEventTs: state.sse.lastEventTs, onToggle: toggleSSE, tenantId: state.tenantId, query: state.query, time: state.time, onStatusUpdate: updateSSEStatus })] }), _jsxs("div", { style: {
                                            backgroundColor: "#ffffff",
                                            border: "1px solid #e2e8f0",
                                            borderRadius: "8px",
                                            flex: 1,
                                            display: "flex",
                                            flexDirection: "column",
                                            overflow: "hidden"
                                        }, children: [_jsxs("div", { style: {
                                                    padding: "16px 20px",
                                                    borderBottom: "1px solid #f1f5f9",
                                                    backgroundColor: "#f8fafc",
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center"
                                                }, children: [_jsxs("div", { children: [_jsx("h3", { style: {
                                                                    margin: 0,
                                                                    fontSize: "16px",
                                                                    fontWeight: 600,
                                                                    color: "#1e293b"
                                                                }, children: "\uD83D\uDD0D Search Results" }), _jsx("div", { style: {
                                                                    fontSize: "13px",
                                                                    color: "#64748b",
                                                                    marginTop: "4px"
                                                                }, children: state.execute ? (_jsxs(_Fragment, { children: ["\uD83D\uDCCA ", state.execute.data.rows?.toLocaleString() || 0, " events", state.execute.data.rows_before_limit_at_least &&
                                                                            state.execute.data.rows_before_limit_at_least > (state.execute.data.rows || 0) &&
                                                                            ` (${state.execute.data.rows_before_limit_at_least.toLocaleString()} total, limited)`, state.execute.took_ms && ` • ⚡ ${state.execute.took_ms}ms`] })) : ("Click 'Run' to search events") })] }), state.sse.connected && (_jsx("div", { style: {
                                                            fontSize: "12px",
                                                            color: "#10b981",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "4px"
                                                        }, children: "\uD83D\uDFE2 Live" }))] }), _jsx("div", { style: { flex: 1, overflow: "hidden" }, children: state.execute ? (_jsx(ResultTable, { data: state.execute.data.data, meta: state.execute.data.meta, rows: state.execute.data.rows, rowsBeforeLimit: state.execute.data.rows_before_limit_at_least, statistics: state.execute.data.statistics, sort: state.sort, onSort: updateSort, limit: state.limit, onLimitChange: updateLimit })) : (_jsxs("div", { style: {
                                                        padding: "40px 20px",
                                                        textAlign: "center",
                                                        color: "#64748b"
                                                    }, children: [_jsx("div", { style: { fontSize: "48px", marginBottom: "16px" }, children: "\uD83D\uDD0D" }), _jsx("div", { style: { fontSize: "16px", fontWeight: 500, marginBottom: "8px" }, children: "Ready to Search" }), _jsx("div", { style: { fontSize: "14px" }, children: "Enter your search query above and click \"Run\" to view events" })] })) })] })] })] })] })] }));
}
