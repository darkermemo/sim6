import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * RecentAlerts - Shows recent alerts list
 * Displays alert title, severity, status, timestamp
 */
export default function RecentAlerts({ alerts, onAlertClick }) {
    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'critical': return '#d32f2f';
            case 'high': return '#f57c00';
            case 'medium': return '#fbc02d';
            case 'low': return '#689f38';
            default: return '#757575';
        }
    };
    const getStatusIcon = (status) => {
        return status === 'open' ? '🔴' : '✓';
    };
    return (_jsxs("div", { "data-testid": "alerts-recent", style: { padding: "20px" }, children: [_jsxs("h3", { children: ["Recent Alerts ", alerts && `(${alerts.total})`] }), !alerts ? (_jsx("div", { style: { color: "#666" }, children: "Loading..." })) : alerts.alerts.length === 0 ? (_jsx("div", { style: { color: "#666" }, children: "No alerts in this time range" })) : (_jsx("div", { style: { maxHeight: "400px", overflowY: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [_jsx("thead", { children: _jsxs("tr", { style: { borderBottom: "2px solid #ddd" }, children: [_jsx("th", { style: { textAlign: "left", padding: "8px" }, children: "Time" }), _jsx("th", { style: { textAlign: "left", padding: "8px" }, children: "Title" }), _jsx("th", { style: { textAlign: "left", padding: "8px" }, children: "Severity" }), _jsx("th", { style: { textAlign: "left", padding: "8px" }, children: "Status" }), _jsx("th", { style: { textAlign: "left", padding: "8px" }, children: "Tenant" })] }) }), _jsx("tbody", { children: alerts.alerts.map(alert => (_jsxs("tr", { style: {
                                    borderBottom: "1px solid #eee",
                                    cursor: onAlertClick ? "pointer" : "default"
                                }, onClick: () => onAlertClick?.(alert.alert_id), onMouseEnter: e => e.currentTarget.style.backgroundColor = "#f5f5f5", onMouseLeave: e => e.currentTarget.style.backgroundColor = "transparent", children: [_jsx("td", { style: { padding: "8px", fontSize: "12px" }, children: new Date(alert.alert_timestamp * 1000).toLocaleString() }), _jsx("td", { style: { padding: "8px" }, children: alert.alert_title }), _jsx("td", { style: { padding: "8px" }, children: _jsx("span", { style: {
                                                color: getSeverityColor(alert.severity),
                                                fontWeight: "bold"
                                            }, children: alert.severity.toUpperCase() }) }), _jsx("td", { style: { padding: "8px" }, children: _jsxs("span", { children: [getStatusIcon(alert.status), " ", alert.status] }) }), _jsx("td", { style: { padding: "8px", fontSize: "12px" }, children: alert.tenant_id })] }, alert.alert_id))) })] }) }))] }));
}
