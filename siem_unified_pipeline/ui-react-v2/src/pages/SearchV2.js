import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import SearchQueryBuilder from "@/components/search/SearchQueryBuilder";
import SearchResults from "@/components/search/SearchResults";
import SearchFacets from "@/components/search/SearchFacets";
import SearchTimeline from "@/components/search/SearchTimeline";
import SearchHistory from "@/components/search/SearchHistory";
import SavedSearches from "@/components/search/SavedSearches";
import ExportModal from "@/components/search/ExportModal";
import LiveTail from "@/components/search/LiveTail";
/**
 * Advanced Search Page - Complete implementation
 * Features: Query builder, facets, timeline, results, live tail, exports, saved searches
 */
export default function SearchV2() {
    // Core search state
    const [tenant] = useState("default");
    const [query, setQuery] = useState("*");
    const [timeRange, setTimeRange] = useState({ last_seconds: 3600 });
    const [selectedFields, setSelectedFields] = useState([]);
    const [sort, setSort] = useState([{ field: "event_timestamp", dir: "desc" }]);
    const [limit, setLimit] = useState(100);
    // Results state
    const [results, setResults] = useState(null);
    const [facets, setFacets] = useState(null);
    const [timeline, setTimeline] = useState(null);
    const [estimate, setEstimate] = useState(null);
    const [cursor, setCursor] = useState(null);
    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [warnings, setWarnings] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [showSaved, setShowSaved] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const [isLiveTail, setIsLiveTail] = useState(false);
    // Schema state
    const [fields, setFields] = useState([]);
    const [enums, setEnums] = useState({});
    const [grammar, setGrammar] = useState(null);
    // Refs
    const abortController = useRef(null);
    // Load schema on mount
    useEffect(() => {
        loadSchema();
    }, [tenant]);
    const loadSchema = async () => {
        try {
            const [fieldsRes, enumsRes, grammarRes] = await Promise.all([
                api.schema.fields(tenant),
                api.schema.enums(tenant),
                api.schema.grammar(),
            ]);
            setFields(fieldsRes.fields);
            setEnums(enumsRes.enums);
            setGrammar(grammarRes);
        }
        catch (err) {
            console.error("Failed to load schema:", err);
        }
    };
    // Main search execution
    const executeSearch = useCallback(async (newCursor) => {
        if (abortController.current) {
            abortController.current.abort();
        }
        setIsLoading(true);
        setError("");
        setWarnings([]);
        const controller = new AbortController();
        abortController.current = controller;
        try {
            // Compile first to validate
            const compileRes = await api.search.compile({
                tenant_id: tenant,
                time: timeRange,
                q: query,
            });
            setWarnings(compileRes.warnings);
            // Execute search
            const executeReq = {
                tenant_id: tenant,
                time: timeRange,
                q: query,
                select: selectedFields.length > 0 ? selectedFields : undefined,
                sort,
                limit,
                cursor: newCursor === undefined ? cursor : newCursor,
            };
            const [executeRes, facetsRes, timelineRes, estimateRes] = await Promise.all([
                api.search.execute(executeReq),
                api.search.facets({
                    tenant_id: tenant,
                    time: timeRange,
                    q: query,
                    facets: [
                        { field: "severity", limit: 10 },
                        { field: "event_type", limit: 10 },
                        { field: "host", limit: 10 },
                    ],
                }),
                api.search.timeline({
                    tenant_id: tenant,
                    time: timeRange,
                    q: query,
                    interval_ms: 60000, // 1 minute buckets
                }),
                api.search.estimate({
                    tenant_id: tenant,
                    time: timeRange,
                    q: query,
                }),
            ]);
            setResults(executeRes);
            setFacets(facetsRes);
            setTimeline(timelineRes);
            setEstimate(estimateRes);
            setCursor(executeRes.next_cursor);
            // Add to history
            await api.history.list(tenant, 1); // Just to trigger history save on backend
        }
        catch (err) {
            if (err.name !== 'AbortError') {
                setError(err.error || err.message || "Search failed");
            }
        }
        finally {
            setIsLoading(false);
            abortController.current = null;
        }
    }, [tenant, timeRange, query, selectedFields, sort, limit, cursor]);
    // Initial search on mount
    useEffect(() => {
        executeSearch(null);
    }, []); // Only on mount
    // Handle query changes with debounce
    const handleQueryChange = useCallback((newQuery) => {
        setQuery(newQuery);
        setCursor(null); // Reset cursor on query change
    }, []);
    // Handle facet clicks
    const handleFacetClick = useCallback((field, value) => {
        const newQuery = query === "*" ? `${field}:${value}` : `${query} AND ${field}:${value}`;
        setQuery(newQuery);
        setCursor(null);
        executeSearch(null);
    }, [query, executeSearch]);
    // Handle save search
    const handleSaveSearch = useCallback(async (name) => {
        try {
            await api.saved.create({
                tenant_id: tenant,
                name,
                q: query,
                time: timeRange,
                select: selectedFields,
                sort,
                owner: "current-user", // Would come from auth
            });
            // Show success toast
        }
        catch (err) {
            console.error("Failed to save search:", err);
        }
    }, [tenant, query, timeRange, selectedFields, sort]);
    // Handle export
    const handleExport = useCallback(async (format, maxRows) => {
        try {
            const res = await api.exports.create({
                tenant_id: tenant,
                time: timeRange,
                q: query,
                select: selectedFields,
                format,
                max_rows: maxRows,
            });
            // Poll for completion
            const pollExport = async () => {
                const status = await api.exports.get(res.export_id);
                if (status.status === "ready" && status.download_url) {
                    window.open(status.download_url, "_blank");
                }
                else if (status.status === "failed") {
                    setError(status.error || "Export failed");
                }
                else {
                    setTimeout(pollExport, 2000);
                }
            };
            setTimeout(pollExport, 1000);
        }
        catch (err) {
            console.error("Failed to export:", err);
        }
    }, [tenant, timeRange, query, selectedFields]);
    return (_jsxs("div", { style: { display: "flex", height: "100vh", overflow: "hidden" }, children: [_jsxs("div", { style: {
                    width: "300px",
                    borderRight: "1px solid var(--border-color)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden"
                }, children: [_jsxs("div", { style: {
                            display: "flex",
                            borderBottom: "1px solid var(--border-color)",
                            backgroundColor: "var(--bg-secondary)"
                        }, children: [_jsx("button", { onClick: () => { setShowHistory(false); setShowSaved(false); }, style: {
                                    flex: 1,
                                    padding: "var(--space-sm)",
                                    border: "none",
                                    background: !showHistory && !showSaved ? "var(--bg-primary)" : "transparent",
                                    borderBottom: !showHistory && !showSaved ? "2px solid var(--color-primary)" : "none",
                                    cursor: "pointer"
                                }, children: "Facets" }), _jsx("button", { onClick: () => { setShowHistory(true); setShowSaved(false); }, style: {
                                    flex: 1,
                                    padding: "var(--space-sm)",
                                    border: "none",
                                    background: showHistory ? "var(--bg-primary)" : "transparent",
                                    borderBottom: showHistory ? "2px solid var(--color-primary)" : "none",
                                    cursor: "pointer"
                                }, children: "History" }), _jsx("button", { onClick: () => { setShowHistory(false); setShowSaved(true); }, style: {
                                    flex: 1,
                                    padding: "var(--space-sm)",
                                    border: "none",
                                    background: showSaved ? "var(--bg-primary)" : "transparent",
                                    borderBottom: showSaved ? "2px solid var(--color-primary)" : "none",
                                    cursor: "pointer"
                                }, children: "Saved" })] }), _jsxs("div", { style: { flex: 1, overflow: "auto", padding: "var(--space-md)" }, children: [!showHistory && !showSaved && facets && (_jsx(SearchFacets, { facets: facets, onFacetClick: handleFacetClick })), showHistory && (_jsx(SearchHistory, { tenant: tenant, onSelect: (item) => {
                                    setQuery(item.q);
                                    setTimeRange(item.time);
                                    executeSearch(null);
                                } })), showSaved && (_jsx(SavedSearches, { tenant: tenant, onSelect: (saved) => {
                                    setQuery(saved.q);
                                    setTimeRange(saved.time);
                                    if (saved.select)
                                        setSelectedFields(saved.select);
                                    if (saved.sort)
                                        setSort(saved.sort);
                                    executeSearch(null);
                                } }))] })] }), _jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }, children: [_jsxs("div", { style: {
                            padding: "var(--space-md)",
                            borderBottom: "1px solid var(--border-color)",
                            backgroundColor: "var(--bg-secondary)"
                        }, children: [_jsx(SearchQueryBuilder, { query: query, timeRange: timeRange, fields: fields, enums: enums, grammar: grammar, onQueryChange: handleQueryChange, onTimeRangeChange: (t) => { setTimeRange(t); setCursor(null); }, onSearch: () => executeSearch(null), isLoading: isLoading }), _jsxs("div", { style: {
                                    display: "flex",
                                    gap: "var(--space-sm)",
                                    marginTop: "var(--space-md)",
                                    alignItems: "center"
                                }, children: [_jsx("button", { onClick: () => executeSearch(null), disabled: isLoading, style: { padding: "var(--space-sm) var(--space-lg)" }, children: isLoading ? "Searching..." : "Search" }), _jsx("button", { onClick: () => setIsLiveTail(!isLiveTail), style: {
                                            padding: "var(--space-sm) var(--space-lg)",
                                            backgroundColor: isLiveTail ? "var(--color-error)" : "var(--color-primary)"
                                        }, children: isLiveTail ? "Stop Live Tail" : "Live Tail" }), _jsx("button", { onClick: () => handleSaveSearch(prompt("Save search as:") || ""), style: { padding: "var(--space-sm) var(--space-lg)" }, children: "Save" }), _jsx("button", { onClick: () => setShowExport(true), style: { padding: "var(--space-sm) var(--space-lg)" }, children: "Export" }), _jsxs("div", { style: { marginLeft: "auto", display: "flex", gap: "var(--space-md)", alignItems: "center" }, children: [estimate && (_jsxs("span", { className: "text-sm text-secondary", children: ["~", estimate.estimated_rows.toLocaleString(), " events"] })), results && (_jsxs("span", { className: "text-sm text-secondary", children: [results.data.rows, " results in ", results.took_ms, "ms"] }))] })] }), warnings.length > 0 && (_jsx("div", { style: {
                                    marginTop: "var(--space-sm)",
                                    padding: "var(--space-sm)",
                                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                                    border: "1px solid rgba(245, 158, 11, 0.3)",
                                    borderRadius: "var(--radius-md)",
                                    fontSize: "0.875rem"
                                }, children: warnings.join(", ") }))] }), timeline && timeline.buckets.length > 0 && (_jsx("div", { style: {
                            height: "120px",
                            padding: "var(--space-md)",
                            borderBottom: "1px solid var(--border-color)"
                        }, children: _jsx(SearchTimeline, { timeline: timeline }) })), _jsx("div", { style: { flex: 1, overflow: "auto" }, children: error ? (_jsx("div", { style: { padding: "var(--space-xl)", textAlign: "center" }, children: _jsx("div", { className: "text-error", children: error }) })) : isLiveTail ? (_jsx(LiveTail, { tenant: tenant, query: query, timeRange: timeRange, selectedFields: selectedFields, onStop: () => setIsLiveTail(false) })) : results ? (_jsx(SearchResults, { results: results, selectedFields: selectedFields, onFieldsChange: setSelectedFields, onSort: (newSort) => { setSort(newSort); executeSearch(null); }, onLoadMore: () => cursor && executeSearch(cursor), hasMore: !!cursor })) : isLoading ? (_jsxs("div", { style: { padding: "var(--space-xl)", textAlign: "center" }, children: [_jsx("div", { className: "loading", style: { fontSize: "2rem" }, children: "\u27F3" }), _jsx("p", { className: "text-secondary", children: "Searching..." })] })) : null })] }), showExport && (_jsx(ExportModal, { onExport: handleExport, onClose: () => setShowExport(false), estimatedRows: estimate?.estimated_rows || 0 }))] }));
}
