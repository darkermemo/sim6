import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useState, useCallback, useMemo } from "react";
import { useCompile, useExecute, useTimeline, useFacets, useSchemaFields, useGrammar, useSearchInvalidation } from "../hooks/useSearchAPI";
import VirtualizedTable from "../components/VirtualizedTable";
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
    const [tenantId, setTenantId] = useState("hr");
    const [query, setQuery] = useState("source_type:nginx.access");
    const [timeSeconds, setTimeSeconds] = useState(3600);
    const [limit, setLimit] = useState(1000);
    // UI State
    const [selectedRows, setSelectedRows] = useState([]);
    const [selectedRowDetails, setSelectedRowDetails] = useState(null);
    const [sseEnabled, setSseEnabled] = useState(false);
    const [tailEvents, setTailEvents] = useState([]);
    // === DEBOUNCED QUERIES ===
    // Key innovation: debounce the query to prevent API spam while typing
    const debouncedQuery = useDebounce(query, 300);
    const debouncedTenant = useDebounce(tenantId, 100);
    const debouncedTime = useDebounce(timeSeconds, 200);
    // Build request objects using debounced values
    const compileRequest = useMemo(() => ({
        tenant_id: debouncedTenant,
        q: debouncedQuery || "*",
        time: { last_seconds: debouncedTime },
    }), [debouncedTenant, debouncedQuery, debouncedTime]);
    const searchRequest = useMemo(() => ({
        tenant_id: debouncedTenant,
        q: debouncedQuery || "*",
        time: { last_seconds: debouncedTime },
        limit,
        sort: [{ field: "event_timestamp", direction: "desc" }],
    }), [debouncedTenant, debouncedQuery, debouncedTime, limit]);
    const facetsRequest = useMemo(() => ({
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
    const { data: compileResult, isLoading: isCompiling, error: compileError } = useCompile(compileRequest);
    const { data: executeResult, isLoading: isExecuting, error: executeError } = useExecute(searchRequest, {
        enabled: !!compileResult?.sql && !compileError
    });
    const { data: timelineResult, isLoading: isTimelineLoading, error: timelineError } = useTimeline(searchRequest, {
        enabled: !!compileResult?.sql && !compileError
    });
    const { data: facetsResult, isLoading: isFacetsLoading, error: facetsError } = useFacets(facetsRequest, {
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
    const handleQueryChange = useCallback((event) => {
        setQuery(event.target.value);
    }, []);
    const handleQuerySubmit = useCallback((event) => {
        event.preventDefault();
        invalidateAll(); // Force refresh with current (non-debounced) values
    }, [invalidateAll]);
    const handleFacetClick = useCallback((field, value) => {
        const facetFilter = `${field}:"${value}"`;
        if (query.includes(facetFilter)) {
            setQuery(prev => prev.replace(facetFilter, '').replace(/\s+/g, ' ').trim());
        }
        else {
            setQuery(prev => `${prev} ${facetFilter}`.trim());
        }
    }, [query]);
    const handleRowClick = useCallback((row) => {
        setSelectedRowDetails(row);
    }, []);
    const handleRowSelect = useCallback((rows) => {
        setSelectedRows(rows);
    }, []);
    const handleSseToggle = useCallback(() => {
        setSseEnabled(!sseEnabled);
        if (sseEnabled) {
            setTailEvents([]); // Clear events when disabling
        }
    }, [sseEnabled]);
    // === DERIVED DATA ===
    const tableColumns = useMemo(() => {
        if (!executeResult?.data.meta)
            return [];
        return executeResult.data.meta.map(col => ({
            name: col.name,
            type: col.type,
            label: col.name,
            sortable: true,
            width: getColumnWidth(col.name, col.type),
        }));
    }, [executeResult?.data.meta]);
    const tableData = useMemo(() => {
        return executeResult?.data.data || [];
    }, [executeResult?.data.data]);
    // Chart options using ECharts
    const timelineOption = useMemo(() => {
        if (!timelineResult?.buckets || timelineResult.buckets.length === 0) {
            return null;
        }
        return ChartUtils.createTimelineOption(timelineResult.buckets, `Events Timeline (${timelineResult.buckets.length} data points)`);
    }, [timelineResult]);
    // Small multiples for top facets
    const facetChartOptions = useMemo(() => {
        if (!facetsResult?.facets)
            return [];
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
    return (_jsxs("div", { className: "search-golden-v4", style: { height: '100vh', display: 'flex', flexDirection: 'column' }, children: [_jsxs("div", { style: {
                    padding: '16px',
                    background: 'var(--surface, #f8fafc)',
                    borderBottom: '1px solid var(--border, #e2e8f0)',
                    flexShrink: 0,
                }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }, children: [_jsx("h1", { style: { margin: 0, fontSize: '20px', fontWeight: '600', color: 'var(--fg, #1f2937)' }, children: "\uD83C\uDFAF Enterprise Search V4 - Complete" }), _jsxs("div", { style: { display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px' }, children: [isAnyLoading && _jsx("span", { style: { color: '#f59e0b' }, children: "\u23F3 Loading..." }), hasErrors && _jsxs("span", { style: { color: '#dc2626' }, children: ["\u26A0\uFE0F ", mainError?.message] }), compileResult && _jsxs("span", { style: { color: '#10b981' }, children: ["\u2713 SQL (", compileResult.took_ms || 0, "ms)"] }), executeResult && (_jsxs("span", { style: { color: '#3b82f6' }, children: ["\uD83D\uDCCA ", executeResult.data.data.length.toLocaleString(), " rows (", executeResult.took_ms, "ms)"] })), sseEnabled && (_jsxs("span", { style: { color: sseConnected ? '#10b981' : '#dc2626' }, children: ["\uD83D\uDCE1 SSE ", sseConnected ? 'Connected' : 'Disconnected', " (", tailEvents.length, ")"] }))] }), _jsxs("div", { style: { marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }, children: [_jsxs("select", { value: tenantId, onChange: (e) => setTenantId(e.target.value), style: { padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #d1d5db' }, children: [_jsx("option", { value: "hr", children: "HR Tenant" }), _jsx("option", { value: "default", children: "Default" }), _jsx("option", { value: "finance", children: "Finance" })] }), _jsxs("select", { value: timeSeconds, onChange: (e) => setTimeSeconds(parseInt(e.target.value)), style: { padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #d1d5db' }, children: [_jsx("option", { value: 3600, children: "1 hour" }), _jsx("option", { value: 86400, children: "24 hours" }), _jsx("option", { value: 604800, children: "7 days" })] }), _jsxs("label", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }, children: [_jsx("input", { type: "checkbox", checked: sseEnabled, onChange: handleSseToggle, disabled: !compileResult?.sql }), "Real-time Tail"] }), _jsx("button", { onClick: () => invalidateAll(), style: {
                                            padding: '6px 12px',
                                            fontSize: '12px',
                                            borderRadius: '4px',
                                            border: '1px solid #d1d5db',
                                            background: 'white',
                                            cursor: 'pointer'
                                        }, children: "\uD83D\uDD04 Refresh" })] })] }), _jsxs("form", { onSubmit: handleQuerySubmit, style: { display: 'flex', gap: '8px' }, children: [_jsx("input", { type: "text", value: query, onChange: handleQueryChange, placeholder: "Enter search query... (debounced 300ms for smooth typing)", style: {
                                    flex: 1,
                                    padding: '8px 12px',
                                    fontSize: '14px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '6px',
                                    outline: 'none',
                                    background: 'var(--surface, white)',
                                    color: 'var(--fg, #1f2937)',
                                } }), _jsx("button", { type: "submit", disabled: isAnyLoading, style: {
                                    padding: '8px 16px',
                                    fontSize: '14px',
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    opacity: isAnyLoading ? 0.6 : 1,
                                }, children: "\uD83D\uDD0D Search" })] }), _jsxs("div", { style: { marginTop: '8px', fontSize: '12px', color: '#6b7280' }, children: [isCompiling && "🔄 Compiling query...", compileResult?.sql && !isCompiling && (_jsxs("details", { children: [_jsx("summary", { style: { cursor: 'pointer' }, children: "\u2705 Query compiled successfully - Click to view SQL" }), _jsx("pre", { style: {
                                            fontSize: '10px',
                                            background: 'var(--surface-muted, #f3f4f6)',
                                            padding: '8px',
                                            borderRadius: '4px',
                                            overflow: 'auto',
                                            margin: '4px 0 0 0',
                                            maxHeight: '100px'
                                        }, children: compileResult.sql })] })), compileError && _jsxs("span", { style: { color: '#dc2626' }, children: ["\u274C Compile error: ", compileError.message] })] })] }), _jsxs("div", { style: { display: 'flex', flex: 1, overflow: 'hidden' }, children: [_jsxs("div", { style: {
                            width: '320px',
                            borderRight: '1px solid var(--border, #e2e8f0)',
                            flexShrink: 0,
                            background: 'var(--surface, white)',
                            display: 'flex',
                            flexDirection: 'column'
                        }, children: [_jsx(VirtualizedFacets, { facets: facetsResult?.facets || {}, loading: isFacetsLoading, error: facetsError, onFacetClick: handleFacetClick, maxHeight: 300, itemHeight: 36 }), sseEnabled && (_jsxs("div", { style: {
                                    flex: 1,
                                    borderTop: '1px solid var(--border, #e2e8f0)',
                                    background: 'var(--surface-muted, #f8fafc)',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }, children: [_jsxs("div", { style: {
                                            padding: '8px 12px',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            color: 'var(--fg-muted, #6b7280)',
                                            borderBottom: '1px solid var(--border, #e2e8f0)'
                                        }, children: ["\uD83D\uDD34 Live Events (", tailEvents.length, ")"] }), _jsxs("div", { style: { flex: 1, overflow: 'auto', padding: '4px' }, children: [tailEvents.map((event, i) => (_jsxs("div", { style: {
                                                    fontSize: '10px',
                                                    padding: '4px 8px',
                                                    marginBottom: '2px',
                                                    background: 'var(--surface, white)',
                                                    borderRadius: '3px',
                                                    borderLeft: '2px solid #10b981',
                                                    fontFamily: 'ui-monospace, monospace'
                                                }, children: [JSON.stringify(event).slice(0, 100), "..."] }, i))), tailEvents.length === 0 && (_jsx("div", { style: {
                                                    padding: '20px',
                                                    textAlign: 'center',
                                                    fontSize: '11px',
                                                    color: 'var(--fg-muted, #6b7280)'
                                                }, children: "Waiting for events..." }))] })] }))] }), _jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }, children: [_jsx("div", { style: {
                                    height: '250px',
                                    borderBottom: '1px solid var(--border, #e2e8f0)',
                                    background: 'var(--surface, white)',
                                    padding: '8px'
                                }, children: _jsx(Chart, { option: timelineOption, height: 234, loading: isTimelineLoading, error: timelineError, theme: "auto" }) }), _jsx("div", { style: {
                                    height: '200px',
                                    borderBottom: '1px solid var(--border, #e2e8f0)',
                                    background: 'var(--surface, white)',
                                    padding: '8px',
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: '8px'
                                }, children: facetChartOptions.map(({ field, option }) => (_jsx(Chart, { option: option, height: 92, loading: isFacetsLoading, theme: "auto" }, field))) }), _jsxs("div", { style: { flex: 1, overflow: 'hidden' }, children: [selectedRows.length > 0 && (_jsxs("div", { style: {
                                            padding: '8px 16px',
                                            background: '#dbeafe',
                                            borderBottom: '1px solid #bfdbfe',
                                            fontSize: '12px',
                                            color: '#1e40af',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px'
                                        }, children: ["\uD83D\uDCCC ", selectedRows.length, " row(s) selected", _jsx("button", { onClick: () => setSelectedRows([]), style: {
                                                    padding: '2px 6px',
                                                    fontSize: '11px',
                                                    background: '#3b82f6',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '3px',
                                                    cursor: 'pointer'
                                                }, children: "Clear" })] })), _jsx(VirtualizedTable, { columns: tableColumns, data: tableData, loading: isExecuting, error: executeError, onRowClick: handleRowClick, onRowSelect: handleRowSelect, height: window.innerHeight - (selectedRows.length > 0 ? 520 : 490), rowHeight: 40, enableSelection: true, enableSorting: true, enableColumnResizing: true })] })] }), selectedRowDetails && (_jsxs("div", { style: {
                            width: '400px',
                            borderLeft: '1px solid var(--border, #e2e8f0)',
                            background: 'var(--surface-muted, #f8fafc)',
                            padding: '16px',
                            overflow: 'auto',
                            flexShrink: 0
                        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }, children: [_jsx("h3", { style: { margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--fg, #1f2937)' }, children: "\uD83D\uDD0D Event Details" }), _jsx("button", { onClick: () => setSelectedRowDetails(null), style: {
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            background: '#e5e7eb',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }, children: "\u2715" })] }), _jsx("div", { style: { fontSize: '12px' }, children: Object.entries(selectedRowDetails).map(([key, value]) => (_jsxs("div", { style: { marginBottom: '12px' }, children: [_jsx("div", { style: { fontWeight: '600', color: 'var(--fg, #374151)', marginBottom: '2px' }, children: key }), _jsx("div", { style: {
                                                background: 'var(--surface, white)',
                                                padding: '6px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid var(--border, #d1d5db)',
                                                fontFamily: 'ui-monospace, monospace',
                                                fontSize: '11px',
                                                wordBreak: 'break-all',
                                                color: 'var(--fg, #1f2937)'
                                            }, children: value == null ? '<null>' : String(value) })] }, key))) })] }))] })] }));
}
// === HELPERS ===
function getColumnWidth(name, type) {
    if (name.includes('timestamp') || name.includes('time'))
        return 180;
    if (name.includes('id') || name.includes('uuid'))
        return 120;
    if (name.includes('ip') || name.includes('address'))
        return 140;
    if (name.includes('url') || name.includes('path'))
        return 250;
    if (name.includes('message') || name.includes('description'))
        return 300;
    if (type.toLowerCase().includes('int') || type.toLowerCase().includes('number'))
        return 100;
    return 150;
}
function formatFieldName(field) {
    return field
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
