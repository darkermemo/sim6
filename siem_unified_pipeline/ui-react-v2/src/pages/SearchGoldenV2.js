import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
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
import { useState, useCallback, useMemo } from "react";
import QueryBar from "../components/search-golden/QueryBar";
import FacetPanel from "../components/search-golden/FacetPanel";
import TimelineChart from "../components/search-golden/TimelineChart";
import ResultTable from "../components/search-golden/ResultTable";
import SavedSearchBar from "../components/search-golden/SavedSearchBar";
import StreamSwitch from "../components/search-golden/StreamSwitch";
import SchemaPanel from "../components/search-golden/SchemaPanel";
import { useCompile, useExecute, useTimeline, useFacets, useSchemaFields, useSchemaEnums, useGrammar, useSearchInvalidation } from "../hooks/useSearchAPI";
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
    const compileRequest = useMemo(() => ({
        tenant_id: tenantId,
        q: query || "*", // Default to match-all if empty
        time: { last_seconds: timeSeconds },
    }), [tenantId, query, timeSeconds]);
    const searchRequest = useMemo(() => ({
        tenant_id: tenantId,
        q: query || "*",
        time: { last_seconds: timeSeconds },
        limit,
        sort: [{ field: "event_timestamp", direction: "desc" }],
    }), [tenantId, query, timeSeconds, limit]);
    const facetsRequest = useMemo(() => ({
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
    const { data: compileResult, isLoading: isCompiling, error: compileError } = useCompile(compileRequest);
    // 2. Execute search only after compile succeeds
    const { data: executeResult, isLoading: isExecuting, error: executeError } = useExecute(searchRequest, {
        enabled: !!compileResult?.sql && !compileError
    });
    // 3. Timeline and facets run in parallel with execute
    const { data: timelineResult, isLoading: isTimelineLoading } = useTimeline(searchRequest, {
        enabled: !!compileResult?.sql && !compileError
    });
    const { data: facetsResult, isLoading: isFacetsLoading } = useFacets(facetsRequest, {
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
    const handleQueryChange = useCallback((newQuery) => {
        setQuery(newQuery);
    }, []);
    const handleTenantChange = useCallback((newTenant) => {
        setTenantId(newTenant);
    }, []);
    const handleTimeChange = useCallback((newTimeSeconds) => {
        setTimeSeconds(newTimeSeconds);
    }, []);
    const handleLimitChange = useCallback((newLimit) => {
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
    return (_jsxs("div", { className: "search-page", "data-testid": "page-search", children: [hasErrors && (_jsxs("div", { style: {
                    background: '#fee',
                    border: '1px solid #fcc',
                    padding: '10px',
                    margin: '10px',
                    borderRadius: '4px',
                    color: '#c33'
                }, children: ["\u26A0\uFE0F ", mainError?.message] })), isAnyLoading && (_jsxs("div", { style: {
                    position: 'fixed',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(0,0,0,0.8)',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    zIndex: 1000
                }, children: [isCompiling && '🔄 Compiling...', isExecuting && '🔍 Searching...', (isTimelineLoading || isFacetsLoading) && '📊 Loading...'] })), _jsxs("div", { className: "search-header", style: {
                    padding: '10px',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }, children: [_jsx("h1", { style: { margin: 0, fontSize: '18px' }, children: "\uD83D\uDD0D Enterprise Search" }), _jsxs("div", { style: { marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }, children: [_jsx("button", { onClick: handleRefresh, style: { padding: '4px 8px', fontSize: '12px' }, children: "\uD83D\uDD04 Refresh" }), _jsxs("label", { style: { fontSize: '12px' }, children: ["Tenant:", _jsxs("select", { value: tenantId, onChange: (e) => handleTenantChange(e.target.value), style: { marginLeft: '5px', padding: '2px' }, children: [_jsx("option", { value: "hr", children: "HR" }), _jsx("option", { value: "default", children: "Default" }), _jsx("option", { value: "finance", children: "Finance" })] })] }), _jsxs("label", { style: { fontSize: '12px' }, children: ["Time:", _jsxs("select", { value: timeSeconds, onChange: (e) => handleTimeChange(parseInt(e.target.value)), style: { marginLeft: '5px', padding: '2px' }, children: [_jsx("option", { value: 3600, children: "1 hour" }), _jsx("option", { value: 86400, children: "24 hours" }), _jsx("option", { value: 604800, children: "7 days" })] })] })] })] }), _jsxs("div", { style: { display: 'flex', height: 'calc(100vh - 80px)' }, children: [_jsx("div", { style: { width: '300px', borderRight: '1px solid #eee', overflow: 'auto' }, children: _jsx(SchemaPanel, { fields: legacyFields, enums: legacyEnums, grammar: legacyGrammar, onFieldClick: (field) => setQuery(prev => prev + ` ${field}`) }) }), _jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column' }, children: [_jsx("div", { style: { borderBottom: '1px solid #eee' }, children: _jsx(QueryBar, { state: legacyState, onQueryChange: handleQueryChange, onExecute: () => { }, onTimeChange: () => { }, onSortChange: () => { } }) }), _jsx("div", { style: { borderBottom: '1px solid #eee' }, children: _jsx(SavedSearchBar, { state: legacyState, onLoad: (search) => {
                                        setQuery(search.query || "");
                                        // TODO: Load other search parameters
                                    }, onSave: () => {
                                        // TODO: Implement save with hooks
                                    }, onDelete: () => {
                                        // TODO: Implement delete with hooks
                                    } }) }), _jsx("div", { style: { height: '200px', borderBottom: '1px solid #eee' }, children: _jsx(TimelineChart, { state: legacyState, onTimeRangeSelect: (from, to) => {
                                        // TODO: Implement time range selection
                                    } }) }), _jsx("div", { style: { flex: 1, overflow: 'hidden' }, children: _jsx(ResultTable, { state: legacyState, onRowClick: (row) => {
                                        // TODO: Implement row detail view
                                    }, onExport: () => {
                                        // TODO: Implement export with hooks
                                    } }) })] }), _jsxs("div", { style: { width: '300px', borderLeft: '1px solid #eee', overflow: 'auto' }, children: [_jsx(FacetPanel, { state: legacyState, onFacetClick: (field, value) => {
                                    setQuery(prev => `${prev} ${field}:${value}`.trim());
                                } }), _jsx("div", { style: { padding: '10px', borderTop: '1px solid #eee' }, children: _jsx(StreamSwitch, { state: legacyState, onToggle: handleSseToggle }) })] })] }), import.meta.env.DEV && (_jsxs("div", { style: {
                    position: 'fixed',
                    bottom: '10px',
                    left: '10px',
                    background: 'rgba(0,0,0,0.8)',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    maxWidth: '300px'
                }, children: [_jsxs("div", { children: ["SQL: ", compileResult?.sql ? '✅' : '❌'] }), _jsxs("div", { children: ["Results: ", executeResult?.data.data.length || 0, " rows"] }), _jsxs("div", { children: ["Timeline: ", timelineResult?.buckets.length || 0, " buckets"] }), _jsxs("div", { children: ["Facets: ", Object.keys(facetsResult?.facets || {}).length, " fields"] }), _jsxs("div", { children: ["Schema: ", legacyFields.length, " fields, ", Object.keys(legacyEnums).length, " enums"] })] }))] }));
}
