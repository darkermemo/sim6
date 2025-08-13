import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * ResultsTable - renders search results in tabular format
 * Displays data rows with column headers from metadata
 */
export default function ResultsTable({ rows, meta, stats }) {
    if (!meta?.length)
        return null;
    const formatValue = (value, columnName) => {
        if (value === null || value === undefined)
            return '';
        // Format timestamps
        if (columnName.includes('timestamp') || columnName.includes('_at')) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.toLocaleString();
            }
        }
        // Format JSON objects
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    };
    const getSeverityColor = (value) => {
        const severity = value?.toLowerCase();
        switch (severity) {
            case 'critical': return 'var(--color-error)';
            case 'high': return 'var(--color-warning)';
            case 'medium': return 'var(--color-info)';
            case 'low': return 'var(--color-success)';
            default: return 'inherit';
        }
    };
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }, children: [_jsxs("h3", { style: { margin: 0, fontSize: '1rem', fontWeight: 600 }, children: ["\uD83D\uDCCA Search Results ", rows.length > 0 && `(${rows.length} rows)`] }), stats && (_jsxs("div", { className: "text-sm text-secondary", children: [stats.took_ms && _jsxs("span", { children: ["\u23F1\uFE0F ", stats.took_ms, "ms"] }), stats.total && stats.total > rows.length && (_jsxs("span", { style: { marginLeft: 'var(--space-md)' }, children: ["Showing ", rows.length, " of ", stats.total, " total"] }))] }))] }), rows.length === 0 ? (_jsxs("div", { style: {
                    textAlign: 'center',
                    padding: 'var(--space-2xl)',
                    color: 'var(--text-tertiary)'
                }, children: [_jsx("div", { style: { fontSize: '3rem', marginBottom: 'var(--space-md)' }, children: "\uD83D\uDD0D" }), _jsx("p", { children: "No results found" }), _jsx("p", { className: "text-sm", children: "Try adjusting your search query or time range" })] })) : (_jsx("div", { style: { overflowX: 'auto' }, children: _jsxs("table", { "data-testid": "results", style: { minWidth: '100%' }, children: [_jsx("thead", { children: _jsx("tr", { children: meta.map(m => (_jsx("th", { style: { whiteSpace: 'nowrap' }, children: m.name }, m.name))) }) }), _jsx("tbody", { children: rows.map((r, i) => (_jsx("tr", { children: meta.map(m => (_jsx("td", { style: {
                                        maxWidth: '300px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: m.name === 'message' ? 'normal' : 'nowrap',
                                        color: m.name === 'severity' ? getSeverityColor(r[m.name]) : 'inherit',
                                        fontWeight: m.name === 'severity' ? 600 : 400
                                    }, title: formatValue(r[m.name], m.name), children: formatValue(r[m.name], m.name) }, m.name))) }, i))) })] }) }))] }));
}
