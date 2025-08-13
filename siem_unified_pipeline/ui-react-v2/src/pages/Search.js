import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import SearchQueryBar from "@/components/search/SearchQueryBar";
import ResultsTable from "@/components/search/ResultsTable";
import { api } from "@/lib/api";
/**
 * Search page - main search interface
 * Manages the compile → execute flow with query builder, SQL preview, and results display
 */
export default function Search() {
    const [model, setModel] = useState({
        tenant_id: "default",
        last_seconds: 600,
        q: "message:hello"
    });
    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState([]);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [stats, setStats] = useState({});
    /**
     * Run search - send structured intent, receive results
     * No SQL is ever exposed to the frontend
     */
    async function run() {
        try {
            setError("");
            setIsLoading(true);
            // Build search intent
            const intent = {
                tenant_id: model.tenant_id,
                time: { last_seconds: model.last_seconds },
                q: model.q,
                limit: 50
            };
            // Execute search with structured intent
            const response = await api.search(intent);
            setRows(response.data);
            setMeta(response.meta);
            setStats({
                took_ms: response.statistics.took_ms,
                total: response.statistics.rows
            });
        }
        catch (err) {
            setError(err.message || String(err));
            setRows([]);
            setMeta([]);
        }
        finally {
            setIsLoading(false);
        }
    }
    // Run initial search on mount
    useEffect(() => {
        run();
    }, []);
    return (_jsxs("div", { className: "container", children: [_jsxs("div", { style: { marginBottom: 'var(--space-xl)' }, children: [_jsx("h2", { style: { margin: 0, marginBottom: 'var(--space-xs)' }, children: "\uD83D\uDD0D Search Events" }), _jsx("p", { className: "text-secondary", style: { margin: 0 }, children: "Query your security events with powerful search capabilities" })] }), _jsx(SearchQueryBar, { value: model, onChange: setModel, onRun: run, isLoading: isLoading }), error ? (_jsx("div", { "data-testid": "error", className: "card", style: {
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--color-error)',
                    marginBottom: 'var(--space-lg)'
                }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }, children: [_jsx("span", { style: { fontSize: '1.5rem' }, children: "\u26A0\uFE0F" }), _jsxs("div", { children: [_jsx("strong", { children: "Search Error" }), _jsx("p", { style: { margin: 0, marginTop: 'var(--space-xs)' }, children: error })] })] }) })) : null, isLoading ? (_jsxs("div", { className: "card", style: { textAlign: 'center', padding: 'var(--space-2xl)' }, children: [_jsx("div", { className: "loading", style: { fontSize: '2rem', marginBottom: 'var(--space-md)' }, children: "\u27F3" }), _jsx("p", { className: "text-secondary", children: "Searching events..." })] })) : (_jsx(ResultsTable, { rows: rows, meta: meta, stats: stats }))] }));
}
