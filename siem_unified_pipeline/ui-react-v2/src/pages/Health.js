import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
/**
 * Health page - displays API health check status
 * Shows health endpoint JSON response or error
 */
export default function Health() {
    const [j, setJ] = useState(null);
    const [err, setErr] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        api.health()
            .then(setJ)
            .catch(e => setErr(String(e)))
            .finally(() => setIsLoading(false));
    }, []);
    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'ok': return 'var(--color-success)';
            case 'degraded': return 'var(--color-warning)';
            case 'down': return 'var(--color-error)';
            default: return 'var(--text-secondary)';
        }
    };
    const components = [
        { name: 'API Server', status: j?.status || 'unknown', icon: '🖥️' },
        { name: 'ClickHouse', status: j?.cidr_fn ? 'ok' : 'unknown', icon: '🗄️' },
        { name: 'Redis', status: j?.redis || 'unknown', icon: '💾' },
        { name: 'Ingest Path', status: j?.ingest_path ? 'ok' : 'unknown', icon: '📥' }
    ];
    return (_jsxs("div", { className: "container", children: [_jsxs("div", { style: { marginBottom: 'var(--space-xl)' }, children: [_jsx("h2", { style: { margin: 0, marginBottom: 'var(--space-xs)' }, children: "\uD83D\uDC9A System Health" }), _jsx("p", { className: "text-secondary", style: { margin: 0 }, children: "Monitor the health status of all system components" })] }), err && (_jsx("div", { "data-testid": "health-error", className: "card", style: {
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--color-error)',
                    marginBottom: 'var(--space-lg)'
                }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }, children: [_jsx("span", { style: { fontSize: '1.5rem' }, children: "\u26A0\uFE0F" }), _jsxs("div", { children: [_jsx("strong", { children: "Health Check Error" }), _jsx("p", { style: { margin: 0, marginTop: 'var(--space-xs)' }, children: err })] })] }) })), isLoading ? (_jsxs("div", { className: "card", style: { textAlign: 'center', padding: 'var(--space-2xl)' }, children: [_jsx("div", { className: "loading", style: { fontSize: '2rem', marginBottom: 'var(--space-md)' }, children: "\u27F3" }), _jsx("p", { className: "text-secondary", children: "Checking system health..." })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "grid", style: {
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: 'var(--space-lg)',
                            marginBottom: 'var(--space-xl)'
                        }, children: components.map((comp) => (_jsxs("div", { className: "card", style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-md)'
                            }, children: [_jsx("div", { style: { fontSize: '2rem' }, children: comp.icon }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("h4", { style: { margin: 0, marginBottom: 'var(--space-xs)' }, children: comp.name }), _jsxs("div", { style: {
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 'var(--space-xs)',
                                                padding: '0.25rem 0.75rem',
                                                backgroundColor: `${getStatusColor(comp.status)}20`,
                                                color: getStatusColor(comp.status),
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: '0.875rem',
                                                fontWeight: 600,
                                                textTransform: 'uppercase'
                                            }, children: [_jsx("span", { style: {
                                                        width: '8px',
                                                        height: '8px',
                                                        backgroundColor: getStatusColor(comp.status),
                                                        borderRadius: '50%',
                                                        display: 'inline-block'
                                                    } }), comp.status] })] })] }, comp.name))) }), j && (_jsxs("div", { className: "card", children: [_jsx("h3", { style: { marginBottom: 'var(--space-md)' }, children: "\uD83D\uDCCB Raw Health Response" }), _jsx("pre", { "data-testid": "health-json", style: {
                                    margin: 0,
                                    fontSize: '0.875rem',
                                    overflow: 'auto'
                                }, children: JSON.stringify(j, null, 2) })] }))] }))] }));
}
