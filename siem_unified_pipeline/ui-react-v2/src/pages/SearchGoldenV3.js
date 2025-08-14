import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SearchGoldenV3 - Complete enterprise search with virtualized components
 *
 * Demonstrates Phase 2 completion:
 * - VirtualizedTable handles 10-50k rows at 60fps
 * - VirtualizedFacets handles 1000+ facet values
 * - Column management from API meta
 * - Smooth scrolling and interaction
 * - Enterprise-grade performance
 */
import { useState, useCallback, useMemo } from "react";
import { useCompile, useExecute, useFacets, useSchemaFields, useSearchInvalidation } from "../hooks/useSearchAPI";
import VirtualizedTable from "../components/VirtualizedTable";
import VirtualizedFacets from "../components/VirtualizedFacets";
/**
 * Enterprise Search Page - Phase 2 Complete
 *
 * Features demonstrated:
 * - Typed API hooks with zod validation
 * - Virtualized table for large datasets
 * - Virtualized facets for large facet lists
 * - Reactive queries (compile → execute → viz)
 * - Error boundaries and loading states
 * - Column management from API metadata
 */
export default function SearchGoldenV3() {
    // Search parameters
    const [tenantId, setTenantId] = useState("hr");
    const [query, setQuery] = useState("source_type:nginx.access");
    const [timeSeconds, setTimeSeconds] = useState(3600); // 1 hour
    const [limit, setLimit] = useState(1000); // Show more data for virtualization demo
    // UI state
    const [selectedRows, setSelectedRows] = useState([]);
    const [selectedRowDetails, setSelectedRowDetails] = useState(null);
    // Build request objects
    const compileRequest = useMemo(() => ({
        tenant_id: tenantId,
        q: query || "*",
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
            { field: 'source_type', size: 20 },
            { field: 'severity', size: 10 },
            { field: 'event_type', size: 15 },
            { field: 'vendor', size: 15 },
            { field: 'product', size: 15 },
            { field: 'event_outcome', size: 10 },
            { field: 'event_category', size: 12 },
            { field: 'event_action', size: 15 },
        ],
    }), [tenantId, query, timeSeconds]);
    // === API HOOKS ===
    const { data: compileResult, isLoading: isCompiling, error: compileError } = useCompile(compileRequest);
    const { data: executeResult, isLoading: isExecuting, error: executeError } = useExecute(searchRequest, {
        enabled: !!compileResult?.sql && !compileError
    });
    const { data: facetsResult, isLoading: isFacetsLoading, error: facetsError } = useFacets(facetsRequest, {
        enabled: !!compileResult?.sql && !compileError
    });
    // Schema for column definitions
    const { data: schemaFields } = useSchemaFields('events');
    // Cache invalidation
    const { invalidateAll } = useSearchInvalidation();
    // === EVENT HANDLERS ===
    const handleQueryChange = useCallback((event) => {
        setQuery(event.target.value);
    }, []);
    const handleQuerySubmit = useCallback((event) => {
        event.preventDefault();
        invalidateAll(); // Force refresh
    }, [invalidateAll]);
    const handleFacetClick = useCallback((field, value, count) => {
        // Add facet filter to query
        const facetFilter = `${field}:"${value}"`;
        if (query.includes(facetFilter)) {
            // Remove filter if it already exists
            setQuery(prev => prev.replace(facetFilter, '').replace(/\s+/g, ' ').trim());
        }
        else {
            // Add filter
            setQuery(prev => `${prev} ${facetFilter}`.trim());
        }
    }, [query]);
    const handleRowClick = useCallback((row, index) => {
        setSelectedRowDetails(row);
    }, []);
    const handleRowSelect = useCallback((rows) => {
        setSelectedRows(rows);
    }, []);
    // === DERIVED DATA ===
    // Transform API meta to table columns
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
    // Table data
    const tableData = useMemo(() => {
        return executeResult?.data.data || [];
    }, [executeResult?.data.data]);
    // Status
    const isAnyLoading = isCompiling || isExecuting || isFacetsLoading;
    const hasErrors = !!(compileError || executeError || facetsError);
    const mainError = compileError || executeError || facetsError;
    return (_jsxs("div", { className: "search-golden-v3", style: { height: '100vh', display: 'flex', flexDirection: 'column' }, children: [_jsxs("div", { style: {
                    padding: '16px',
                    background: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    flexShrink: 0,
                }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }, children: [_jsx("h1", { style: { margin: 0, fontSize: '20px', fontWeight: '600' }, children: "\uD83D\uDE80 Enterprise Search V3" }), _jsxs("div", { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }, children: [isAnyLoading && _jsx("span", { style: { color: '#f59e0b' }, children: "\u23F3 Loading..." }), hasErrors && _jsxs("span", { style: { color: '#dc2626' }, children: ["\u26A0\uFE0F ", mainError?.message] }), compileResult && _jsx("span", { style: { color: '#10b981' }, children: "\u2713 SQL" }), executeResult && (_jsxs("span", { style: { color: '#3b82f6' }, children: ["\uD83D\uDCCA ", executeResult.data.data.length.toLocaleString(), " rows (", executeResult.took_ms, "ms)"] }))] }), _jsxs("div", { style: { marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }, children: [_jsxs("select", { value: tenantId, onChange: (e) => setTenantId(e.target.value), style: { padding: '4px 8px', fontSize: '12px', borderRadius: '4px' }, children: [_jsx("option", { value: "hr", children: "HR" }), _jsx("option", { value: "default", children: "Default" }), _jsx("option", { value: "finance", children: "Finance" })] }), _jsxs("select", { value: timeSeconds, onChange: (e) => setTimeSeconds(parseInt(e.target.value)), style: { padding: '4px 8px', fontSize: '12px', borderRadius: '4px' }, children: [_jsx("option", { value: 3600, children: "1 hour" }), _jsx("option", { value: 86400, children: "24 hours" }), _jsx("option", { value: 604800, children: "7 days" })] }), _jsx("button", { onClick: () => invalidateAll(), style: {
                                            padding: '6px 12px',
                                            fontSize: '12px',
                                            borderRadius: '4px',
                                            border: '1px solid #d1d5db',
                                            background: 'white',
                                            cursor: 'pointer'
                                        }, children: "\uD83D\uDD04 Refresh" })] })] }), _jsxs("form", { onSubmit: handleQuerySubmit, style: { display: 'flex', gap: '8px' }, children: [_jsx("input", { type: "text", value: query, onChange: handleQueryChange, placeholder: "Enter search query... (e.g., source_type:nginx.access severity:high)", style: {
                                    flex: 1,
                                    padding: '8px 12px',
                                    fontSize: '14px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '6px',
                                    outline: 'none',
                                }, onFocus: (e) => {
                                    e.target.style.borderColor = '#3b82f6';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                                }, onBlur: (e) => {
                                    e.target.style.borderColor = '#d1d5db';
                                    e.target.style.boxShadow = 'none';
                                } }), _jsx("button", { type: "submit", disabled: isAnyLoading, style: {
                                    padding: '8px 16px',
                                    fontSize: '14px',
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    opacity: isAnyLoading ? 0.6 : 1,
                                }, children: "\uD83D\uDD0D Search" })] }), compileResult?.sql && (_jsxs("details", { style: { marginTop: '8px' }, children: [_jsx("summary", { style: { fontSize: '12px', color: '#6b7280', cursor: 'pointer' }, children: "\uD83D\uDCCB Generated SQL" }), _jsx("pre", { style: {
                                    fontSize: '11px',
                                    background: '#f3f4f6',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    overflow: 'auto',
                                    margin: '4px 0 0 0',
                                    maxHeight: '100px'
                                }, children: compileResult.sql })] }))] }), _jsxs("div", { style: { display: 'flex', flex: 1, overflow: 'hidden' }, children: [_jsx("div", { style: {
                            width: '320px',
                            borderRight: '1px solid #e2e8f0',
                            flexShrink: 0,
                            background: '#ffffff'
                        }, children: _jsx(VirtualizedFacets, { facets: facetsResult?.facets || {}, loading: isFacetsLoading, error: facetsError, onFacetClick: handleFacetClick, maxHeight: 300, itemHeight: 36 }) }), _jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column' }, children: [selectedRows.length > 0 && (_jsxs("div", { style: {
                                    padding: '8px 16px',
                                    background: '#dbeafe',
                                    borderBottom: '1px solid #bfdbfe',
                                    fontSize: '12px',
                                    color: '#1e40af'
                                }, children: ["\uD83D\uDCCC ", selectedRows.length, " row(s) selected", _jsx("button", { onClick: () => setSelectedRows([]), style: {
                                            marginLeft: '12px',
                                            padding: '2px 6px',
                                            fontSize: '11px',
                                            background: '#3b82f6',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '3px',
                                            cursor: 'pointer'
                                        }, children: "Clear" })] })), _jsx("div", { style: { flex: 1 }, children: _jsx(VirtualizedTable, { columns: tableColumns, data: tableData, loading: isExecuting, error: executeError, onRowClick: handleRowClick, onRowSelect: handleRowSelect, height: selectedRows.length > 0 ?
                                        window.innerHeight - 200 : // Account for selection bar
                                        window.innerHeight - 160 // Just header
                                    , rowHeight: 40, enableSelection: true, enableSorting: true, enableColumnResizing: true }) })] }), selectedRowDetails && (_jsxs("div", { style: {
                            width: '400px',
                            borderLeft: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            padding: '16px',
                            overflow: 'auto',
                            flexShrink: 0
                        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }, children: [_jsx("h3", { style: { margin: 0, fontSize: '14px', fontWeight: '600' }, children: "\uD83D\uDD0D Row Details" }), _jsx("button", { onClick: () => setSelectedRowDetails(null), style: {
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            background: '#e5e7eb',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }, children: "\u2715" })] }), _jsx("div", { style: { fontSize: '12px' }, children: Object.entries(selectedRowDetails).map(([key, value]) => (_jsxs("div", { style: { marginBottom: '12px' }, children: [_jsx("div", { style: { fontWeight: '600', color: '#374151', marginBottom: '2px' }, children: key }), _jsx("div", { style: {
                                                background: '#ffffff',
                                                padding: '6px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid #d1d5db',
                                                fontFamily: 'ui-monospace, monospace',
                                                fontSize: '11px',
                                                wordBreak: 'break-all',
                                                color: '#1f2937'
                                            }, children: value == null ? '<null>' : String(value) })] }, key))) })] }))] })] }));
}
// === HELPERS ===
function getColumnWidth(name, type) {
    // Smart column width based on name and type
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
    return 150; // Default width
}
