import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * KpiStrip - Shows key performance indicators
 * Displays ingest rate, query rate, storage used, error count
 */
export default function KpiStrip({ ingest, query, storage, errors }) {
    const formatBytes = (bytes) => {
        if (bytes < 1024)
            return `${bytes} B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024)
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };
    const formatNumber = (num) => {
        if (num < 1000)
            return String(num);
        if (num < 1000000)
            return `${(num / 1000).toFixed(1)}K`;
        return `${(num / 1000000).toFixed(1)}M`;
    };
    return (_jsxs("div", { className: "card", style: {
            display: "flex",
            gap: "var(--space-lg)",
            marginBottom: "var(--space-lg)"
        }, children: [_jsxs("div", { style: { flex: 1, textAlign: "center" }, children: [_jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "Ingest Rate" }), _jsx("div", { "data-testid": "kpi-ingest-rows", style: { fontSize: "24px", fontWeight: "bold" }, children: ingest ? formatNumber(ingest.totals.rows_in) : "—" }), _jsxs("div", { style: { fontSize: "12px", color: "#666" }, children: ["rows (", ingest ? formatBytes(ingest.totals.bytes_in) : "—", ")"] })] }), _jsxs("div", { style: { flex: 1, textAlign: "center" }, children: [_jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "Queries" }), _jsx("div", { style: { fontSize: "24px", fontWeight: "bold" }, children: query ? formatNumber(query.totals.queries) : "—" }), _jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "total queries" })] }), _jsxs("div", { style: { flex: 1, textAlign: "center" }, children: [_jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "Storage Used" }), _jsx("div", { style: { fontSize: "24px", fontWeight: "bold" }, children: storage ? formatBytes(storage.latest.storage_bytes) : "—" }), _jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "total storage" })] }), _jsxs("div", { style: { flex: 1, textAlign: "center" }, children: [_jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "Errors" }), _jsx("div", { style: { fontSize: "24px", fontWeight: "bold", color: errors?.totals.errors ? "#c00" : "#000" }, children: errors ? formatNumber(errors.totals.errors) : "—" }), _jsx("div", { style: { fontSize: "12px", color: "#666" }, children: "total errors" })] })] }));
}
