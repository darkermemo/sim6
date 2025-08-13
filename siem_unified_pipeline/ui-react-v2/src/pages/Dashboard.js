import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
/**
 * Dashboard page - demonstrates secure panel queries
 * All panels use allow-listed SQL templates on the backend
 */
export default function Dashboard() {
    const [panels, setPanels] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    // Panel definitions - no SQL, just structured intents
    const panelDefs = [
        { kind: "timeseries_count", id: "events_over_time" },
        { kind: "by_severity_top", id: "severity_dist", limit: 5 },
        { kind: "single_stat", id: "total_events", stat: "count" },
        { kind: "single_stat", id: "unique_users", stat: "unique_users" },
        { kind: "top_sources", id: "top_sources", limit: 10 },
        { kind: "event_types", id: "event_types", limit: 10 },
    ];
    async function loadPanels() {
        try {
            setError("");
            setIsLoading(true);
            // Time range: last hour
            const now = Math.floor(Date.now() / 1000);
            const oneHourAgo = now - 3600;
            const response = await api.panels({
                tenant_id: "default",
                time: {
                    from: oneHourAgo,
                    to: now,
                    interval_seconds: 300, // 5 minutes
                },
                panels: panelDefs,
            });
            setPanels(response.results);
        }
        catch (err) {
            setError(err.message || String(err));
        }
        finally {
            setIsLoading(false);
        }
    }
    useEffect(() => {
        loadPanels();
        // Refresh every 30 seconds
        const interval = setInterval(loadPanels, 30000);
        return () => clearInterval(interval);
    }, []);
    // Render different panel types
    const renderPanel = (panel) => {
        if (panel.error) {
            return (_jsxs("div", { className: "card", style: {
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                }, children: [_jsx("h4", { children: panel.id }), _jsx("p", { className: "text-error", children: panel.error })] }, panel.id));
        }
        // Single stat panels
        if (panel.columns.length === 1 && panel.columns[0] === "value") {
            const value = panel.rows[0]?.value || 0;
            return (_jsxs("div", { className: "card", children: [_jsx("h4", { className: "text-sm text-secondary", style: { marginBottom: 'var(--space-sm)' }, children: panel.id.replace(/_/g, ' ').toUpperCase() }), _jsx("div", { style: { fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-primary)' }, children: value.toLocaleString() })] }, panel.id));
        }
        // Timeseries panel
        if (panel.id === "events_over_time") {
            return (_jsxs("div", { className: "card", style: { gridColumn: 'span 2' }, children: [_jsx("h4", { children: "Events Over Time" }), _jsx("div", { style: { height: '200px', overflowY: 'auto' }, children: _jsx("pre", { children: JSON.stringify(panel.rows, null, 2) }) })] }, panel.id));
        }
        // Table panels
        return (_jsxs("div", { className: "card", children: [_jsx("h4", { children: panel.id.replace(/_/g, ' ').toUpperCase() }), _jsx("div", { style: { overflowX: 'auto' }, children: _jsxs("table", { style: { width: '100%', fontSize: '0.875rem' }, children: [_jsx("thead", { children: _jsx("tr", { children: panel.columns.map(col => (_jsx("th", { children: col }, col))) }) }), _jsx("tbody", { children: panel.rows.slice(0, 5).map((row, i) => (_jsx("tr", { children: panel.columns.map(col => (_jsx("td", { children: row[col] }, col))) }, i))) })] }) })] }, panel.id));
    };
    return (_jsxs("div", { "data-testid": "page-dashboard", className: "container", children: [_jsxs("div", { style: { marginBottom: 'var(--space-xl)' }, children: [_jsx("h2", { style: { margin: 0, marginBottom: 'var(--space-xs)' }, children: "\uD83D\uDCCA Security Dashboard" }), _jsx("p", { className: "text-secondary", style: { margin: 0 }, children: "Real-time security metrics and insights" })] }), error && (_jsx("div", { className: "card", style: {
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--color-error)',
                    marginBottom: 'var(--space-lg)'
                }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }, children: [_jsx("span", { style: { fontSize: '1.5rem' }, children: "\u26A0\uFE0F" }), _jsxs("div", { children: [_jsx("strong", { children: "Dashboard Error" }), _jsx("p", { style: { margin: 0, marginTop: 'var(--space-xs)' }, children: error })] })] }) })), isLoading ? (_jsxs("div", { className: "card", style: { textAlign: 'center', padding: 'var(--space-2xl)' }, children: [_jsx("div", { className: "loading", style: { fontSize: '2rem', marginBottom: 'var(--space-md)' }, children: "\u27F3" }), _jsx("p", { className: "text-secondary", children: "Loading dashboard..." })] })) : (_jsx("div", { style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: 'var(--space-lg)'
                }, children: panels.map(renderPanel) }))] }));
}
