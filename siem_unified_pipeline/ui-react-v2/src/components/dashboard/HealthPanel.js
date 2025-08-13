import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * HealthPanel - Shows component health status
 * Displays ClickHouse, Redis, API status and versions
 */
export default function HealthPanel({ health }) {
    const getStatusColor = (status) => {
        switch (status) {
            case 'ok': return '#4caf50';
            case 'degraded': return '#ff9800';
            case 'down': return '#f44336';
            default: return '#9e9e9e';
        }
    };
    const getStatusIcon = (status) => {
        switch (status) {
            case 'ok': return '✓';
            case 'degraded': return '!';
            case 'down': return '✗';
            default: return '?';
        }
    };
    if (!health) {
        return (_jsxs("div", { style: { padding: "20px" }, children: [_jsx("h3", { children: "System Health" }), _jsx("div", { style: { color: "#666" }, children: "Loading..." })] }));
    }
    return (_jsxs("div", { style: { padding: "20px" }, children: [_jsx("h3", { children: "System Health" }), _jsxs("div", { style: {
                    marginBottom: "20px",
                    padding: "10px",
                    backgroundColor: getStatusColor(health.status) + '20',
                    borderRadius: "4px"
                }, children: [_jsx("strong", { children: "Overall Status:" }), " ", health.status.toUpperCase()] }), _jsxs("div", { style: { display: "flex", gap: "10px" }, children: [_jsxs("div", { style: {
                            flex: 1,
                            padding: "10px",
                            border: "1px solid #ddd",
                            borderRadius: "4px"
                        }, children: [_jsx("div", { style: { fontWeight: "bold", marginBottom: "5px" }, children: "ClickHouse" }), _jsx("div", { "data-testid": "health-ch", "data-status": health.components?.clickhouse?.status || health.status, style: {
                                    color: getStatusColor(health.components?.clickhouse?.status || health.status),
                                    fontSize: "24px"
                                }, children: getStatusIcon(health.components?.clickhouse?.status || health.status) }), _jsx("div", { style: { fontSize: "12px", color: "#666" }, children: health.components?.clickhouse?.version || 'Available' })] }), _jsxs("div", { style: {
                            flex: 1,
                            padding: "10px",
                            border: "1px solid #ddd",
                            borderRadius: "4px"
                        }, children: [_jsx("div", { style: { fontWeight: "bold", marginBottom: "5px" }, children: "Redis" }), _jsx("div", { style: {
                                    color: getStatusColor(health.components?.redis?.status || health.redis || 'ok'),
                                    fontSize: "24px"
                                }, children: getStatusIcon(health.components?.redis?.status || health.redis || 'ok') }), _jsx("div", { style: { fontSize: "12px", color: "#666" }, children: health.components?.redis?.version || 'Available' })] }), _jsxs("div", { style: {
                            flex: 1,
                            padding: "10px",
                            border: "1px solid #ddd",
                            borderRadius: "4px"
                        }, children: [_jsx("div", { style: { fontWeight: "bold", marginBottom: "5px" }, children: "API" }), _jsx("div", { style: {
                                    color: getStatusColor(health.components?.api?.status || health.status),
                                    fontSize: "24px"
                                }, children: getStatusIcon(health.components?.api?.status || health.status) }), _jsx("div", { style: { fontSize: "12px", color: "#666" }, children: health.components?.api?.version || 'v2.0' })] })] })] }));
}
