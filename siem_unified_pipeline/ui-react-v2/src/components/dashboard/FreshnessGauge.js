import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * FreshnessGauge - Shows index freshness metrics
 * Displays max and average lag with visual indicators
 */
export default function FreshnessGauge({ freshness }) {
    if (!freshness || freshness.series.length === 0) {
        return (_jsxs("div", { style: { padding: "20px" }, children: [_jsx("h3", { children: "Index Freshness" }), _jsx("div", { style: { color: "#666" }, children: "No data available" })] }));
    }
    // Get latest values
    const latest = freshness.series[freshness.series.length - 1];
    const maxLag = latest.max_lag_seconds;
    const avgLag = latest.avg_lag_seconds;
    // Calculate trend (compare with previous point)
    let trend = 'stable';
    if (freshness.series.length > 1) {
        const previous = freshness.series[freshness.series.length - 2];
        if (latest.max_lag_seconds > previous.max_lag_seconds)
            trend = 'increasing';
        else if (latest.max_lag_seconds < previous.max_lag_seconds)
            trend = 'decreasing';
    }
    const getLagColor = (seconds) => {
        if (seconds < 60)
            return '#4caf50'; // Green - under 1 minute
        if (seconds < 300)
            return '#ff9800'; // Orange - under 5 minutes
        return '#f44336'; // Red - over 5 minutes
    };
    const formatDuration = (seconds) => {
        if (seconds < 60)
            return `${seconds.toFixed(0)}s`;
        if (seconds < 3600)
            return `${(seconds / 60).toFixed(1)}m`;
        return `${(seconds / 3600).toFixed(1)}h`;
    };
    return (_jsxs("div", { style: { padding: "20px" }, children: [_jsx("h3", { children: "Index Freshness" }), _jsxs("div", { style: { display: "flex", gap: "20px", marginTop: "10px" }, children: [_jsxs("div", { style: {
                            flex: 1,
                            padding: "15px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            backgroundColor: getLagColor(maxLag) + '10'
                        }, children: [_jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "Max Lag" }), _jsx("div", { style: {
                                    fontSize: "28px",
                                    fontWeight: "bold",
                                    color: getLagColor(maxLag)
                                }, children: formatDuration(maxLag) }), _jsxs("div", { style: { fontSize: "12px", color: "#666" }, children: [trend === 'increasing' && '↑ Increasing', trend === 'decreasing' && '↓ Decreasing', trend === 'stable' && '→ Stable'] })] }), _jsxs("div", { style: {
                            flex: 1,
                            padding: "15px",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            backgroundColor: getLagColor(avgLag) + '10'
                        }, children: [_jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "Average Lag" }), _jsx("div", { style: {
                                    fontSize: "28px",
                                    fontWeight: "bold",
                                    color: getLagColor(avgLag)
                                }, children: formatDuration(avgLag) }), _jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "across all indices" })] })] }), _jsx("div", { style: { marginTop: "20px" }, children: _jsx("svg", { width: "300", height: "50", children: _jsx("polyline", { points: freshness.series.slice(-20).map((point, i) => `${i * 15},${50 - (point.max_lag_seconds / Math.max(...freshness.series.map(p => p.max_lag_seconds))) * 40}`).join(' '), fill: "none", stroke: getLagColor(maxLag), strokeWidth: "2" }) }) })] }));
}
