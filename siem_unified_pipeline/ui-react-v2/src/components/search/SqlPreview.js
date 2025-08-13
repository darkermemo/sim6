import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SqlPreview - displays compiled SQL query
 * Shows the SQL generated from the search query
 */
export default function SqlPreview({ sql }) {
    if (!sql)
        return null;
    return (_jsxs("div", { className: "card", style: { marginBottom: 'var(--space-lg)' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }, children: [_jsx("h3", { style: { margin: 0, fontSize: '1rem', fontWeight: 600 }, children: "\uD83D\uDCCB Generated SQL Query" }), _jsx("button", { onClick: () => navigator.clipboard.writeText(sql), style: {
                            padding: 'var(--space-xs) var(--space-sm)',
                            fontSize: '0.75rem',
                            backgroundColor: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-color)'
                        }, children: "\uD83D\uDCCB Copy SQL" })] }), _jsx("pre", { "data-testid": "sql", style: {
                    margin: 0,
                    fontSize: '0.875rem',
                    lineHeight: 1.5,
                    maxHeight: '200px',
                    overflow: 'auto'
                }, children: sql })] }));
}
