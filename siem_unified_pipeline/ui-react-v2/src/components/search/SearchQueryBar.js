import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
/**
 * SearchQueryBar - input controls for search parameters
 * Manages tenant_id, time range (last_seconds), and query string
 * Emits onChange for each field update and onRun when user clicks Run
 */
export default function SearchQueryBar(props) {
    const [m, setM] = useState(props.value);
    /**
     * Update a single field in the model
     */
    function set(k, v) {
        const next = { ...m, [k]: v };
        setM(next);
        props.onChange(next);
    }
    const timeOptions = [
        { value: 60, label: 'Last 1 minute' },
        { value: 300, label: 'Last 5 minutes' },
        { value: 900, label: 'Last 15 minutes' },
        { value: 1800, label: 'Last 30 minutes' },
        { value: 3600, label: 'Last 1 hour' },
        { value: 21600, label: 'Last 6 hours' },
        { value: 86400, label: 'Last 24 hours' },
    ];
    return (_jsxs("div", { "data-testid": "querybar", className: "card", style: { marginBottom: 'var(--space-lg)' }, children: [_jsxs("div", { style: { display: 'grid', gap: 'var(--space-md)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }, children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "tenant", className: "text-sm text-secondary", style: { display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }, children: "Tenant ID" }), _jsx("input", { id: "tenant", "aria-label": "tenant", value: m.tenant_id, onChange: e => set("tenant_id", e.target.value), placeholder: "Enter tenant ID", style: { width: '100%' } })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "timerange", className: "text-sm text-secondary", style: { display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }, children: "Time Range" }), _jsx("select", { id: "timerange", "aria-label": "last-seconds", value: m.last_seconds, onChange: e => set("last_seconds", Number(e.target.value)), style: { width: '100%' }, children: timeOptions.map(opt => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) })] })] }), _jsxs("div", { style: { marginTop: 'var(--space-md)' }, children: [_jsx("label", { htmlFor: "query", className: "text-sm text-secondary", style: { display: 'block', marginBottom: 'var(--space-xs)', fontWeight: 500 }, children: "Search Query" }), _jsxs("div", { style: { display: 'flex', gap: 'var(--space-sm)' }, children: [_jsx("input", { id: "query", "aria-label": "query", value: m.q, onChange: e => set("q", e.target.value), placeholder: "Enter search query (e.g., message:error AND severity:high)", style: { flex: 1 }, onKeyDown: e => e.key === 'Enter' && props.onRun() }), _jsx("button", { onClick: props.onRun, "aria-label": "run", disabled: props.isLoading || !m.tenant_id || !m.q, style: {
                                    padding: '0 var(--space-xl)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-xs)'
                                }, children: props.isLoading ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "loading", children: "\u27F3" }), " Searching..."] })) : (_jsx(_Fragment, { children: "\uD83D\uDD0D Run Search" })) })] }), _jsx("p", { className: "text-xs text-tertiary", style: { marginTop: 'var(--space-xs)' }, children: "Use Lucene-style syntax: field:value, AND, OR, NOT, wildcards (*), phrases (\"exact match\")" })] })] }));
}
