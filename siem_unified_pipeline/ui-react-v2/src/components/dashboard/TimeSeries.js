import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * TimeSeries - Generic line chart component
 * Used for ingest rate, query latency, error rate charts
 */
export default function TimeSeries({ title, series, fields, colors = ["#4285f4", "#ea4335", "#fbbc04", "#34a853"], height = 200, testId }) {
    if (!series || series.length === 0) {
        return (_jsxs("div", { style: { padding: "20px", textAlign: "center" }, children: [_jsx("h3", { children: title }), _jsx("div", { style: { color: "#666" }, children: "No data available" })] }));
    }
    // Calculate min/max for scaling
    const allValues = series.flatMap(point => fields.map(field => point[field] || 0));
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const range = maxValue - minValue || 1;
    // Calculate time range
    const times = series.map(p => p.t);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeRange = maxTime - minTime || 1;
    const width = 800;
    const margin = { top: 20, right: 100, bottom: 40, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    // Scale functions
    const xScale = (t) => ((t - minTime) / timeRange) * innerWidth;
    const yScale = (v) => innerHeight - ((v - minValue) / range) * innerHeight;
    return (_jsxs("div", { "data-testid": testId, style: { padding: "20px" }, children: [_jsx("h3", { children: title }), _jsx("svg", { width: width, height: height, children: _jsxs("g", { transform: `translate(${margin.left},${margin.top})`, children: [[0, 0.25, 0.5, 0.75, 1].map(tick => {
                            const y = innerHeight * (1 - tick);
                            const value = minValue + range * tick;
                            return (_jsxs("g", { children: [_jsx("line", { x1: 0, y1: y, x2: innerWidth, y2: y, stroke: "#e0e0e0", strokeDasharray: "2,2" }), _jsx("text", { x: -5, y: y + 4, textAnchor: "end", fontSize: "10", fill: "#666", children: value.toFixed(1) })] }, tick));
                        }), fields.map((field, fieldIndex) => {
                            const pathData = series
                                .map((point, i) => {
                                const x = xScale(point.t);
                                const y = yScale(point[field] || 0);
                                return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
                            })
                                .join(' ');
                            return (_jsxs("g", { children: [_jsx("path", { d: pathData, stroke: colors[fieldIndex % colors.length], strokeWidth: "2", fill: "none" }), _jsx("text", { x: innerWidth + 10, y: 20 + fieldIndex * 20, fontSize: "12", fill: colors[fieldIndex % colors.length], children: field })] }, field));
                        }), _jsx("line", { x1: 0, y1: innerHeight, x2: innerWidth, y2: innerHeight, stroke: "#666" }), _jsx("text", { x: 0, y: innerHeight + 20, fontSize: "10", fill: "#666", children: new Date(minTime * 1000).toLocaleTimeString() }), _jsx("text", { x: innerWidth, y: innerHeight + 20, fontSize: "10", fill: "#666", textAnchor: "end", children: new Date(maxTime * 1000).toLocaleTimeString() })] }) })] }));
}
