import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
/**
 * ResultTable - Renders search results
 * Features: sorting, column selection, pagination, row copy
 */
export default function ResultTable({ data, meta, rows, rowsBeforeLimit, statistics, sort, onSort, limit, onLimitChange, }) {
    const handleSort = (field) => {
        const currentSort = sort.find(s => s.field === field);
        const newDir = currentSort?.dir === "asc" ? "desc" : "asc";
        onSort([{ field, dir: newDir }]);
    };
    const copyRow = (row) => {
        navigator.clipboard.writeText(JSON.stringify(row, null, 2));
    };
    // UX controls: compact view, hide-empty, column picker
    const defaultCompact = useMemo(() => [
        "event_timestamp",
        "created_at",
        "severity",
        "event_type",
        "message",
        "source_type",
        "source_ip",
        "destination_ip",
        "user",
        "host",
    ], []);
    const allColumnNames = useMemo(() => meta.map(m => m.name), [meta]);
    const [visibleColumns, setVisibleColumns] = useState(allColumnNames.filter(n => defaultCompact.includes(n)));
    const [hideEmpty, setHideEmpty] = useState(true);
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const isEmptyValue = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && Object.keys(v).length === 0);
    const nonEmptyByColumn = useMemo(() => {
        const map = {};
        for (const m of meta) {
            map[m.name] = data.some(row => !isEmptyValue(row[m.name]));
        }
        return map;
    }, [data, meta]);
    const columnsToRender = useMemo(() => {
        const base = (visibleColumns.length ? visibleColumns : allColumnNames);
        return meta.filter(m => base.includes(m.name)).filter(m => (hideEmpty ? nonEmptyByColumn[m.name] : true));
    }, [meta, visibleColumns, hideEmpty, nonEmptyByColumn, allColumnNames]);
    return (_jsxs("div", { style: { flex: 1, overflow: "auto", padding: "10px" }, children: [_jsx("h3", { children: "Results" }), _jsxs("div", { "data-testid": "result-meta", style: { marginBottom: "10px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }, children: [_jsxs("strong", { children: [rows, " rows"] }), rowsBeforeLimit > rows && ` (${rowsBeforeLimit} before limit)`, statistics && (_jsxs("span", { style: { marginLeft: "8px", color: "#666" }, children: [statistics.elapsed, "s elapsed, ", statistics.rows_read, " rows read, ", statistics.bytes_read, " bytes"] })), _jsxs("label", { style: { marginLeft: "auto", fontSize: 12 }, children: ["Rows:", _jsxs("select", { value: limit, onChange: e => onLimitChange(parseInt(e.target.value)), style: { marginLeft: 6 }, children: [_jsx("option", { value: "10", children: "10" }), _jsx("option", { value: "50", children: "50" }), _jsx("option", { value: "100", children: "100" }), _jsx("option", { value: "500", children: "500" }), _jsx("option", { value: "1000", children: "1000" })] })] }), _jsxs("label", { style: { fontSize: 12 }, children: [_jsx("input", { type: "checkbox", checked: hideEmpty, onChange: e => setHideEmpty(e.target.checked) }), " Hide empty columns"] }), _jsx("button", { onClick: () => setVisibleColumns(allColumnNames.filter(n => defaultCompact.includes(n))), style: { fontSize: 12 }, children: "Compact" }), _jsx("button", { onClick: () => setVisibleColumns(allColumnNames), style: { fontSize: 12 }, children: "All fields" }), _jsxs("label", { style: { fontSize: 12 }, children: ["Columns:", _jsx("select", { multiple: true, value: visibleColumns, onChange: e => {
                                    const options = Array.from(e.target.selectedOptions).map(o => o.value);
                                    setVisibleColumns(options);
                                }, style: { marginLeft: 6, minWidth: 200, maxHeight: 80 }, children: allColumnNames.map(name => (_jsx("option", { value: name, children: name }, name))) })] })] }), _jsx("div", { "data-testid": "result-table", style: { overflowX: "auto" }, children: _jsxs("table", { style: { borderCollapse: "collapse", width: "100%" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { border: "1px solid #ccc", padding: "5px", position: "sticky", left: 0, background: "#fff", zIndex: 1 }, children: "Actions" }), columnsToRender.map(col => {
                                        const currentSort = sort.find(s => s.field === col.name);
                                        return (_jsxs("th", { onClick: () => handleSort(col.name), style: {
                                                border: "1px solid #ccc",
                                                padding: "5px",
                                                cursor: "pointer",
                                                backgroundColor: currentSort ? "#f0f0f0" : "white",
                                                whiteSpace: "nowrap",
                                            }, children: [col.name, currentSort && (_jsxs("span", { children: [" ", currentSort.dir === "asc" ? "↑" : "↓"] })), _jsx("div", { style: { fontSize: "10px", color: "#666" }, children: col.type })] }, col.name));
                                    })] }) }), _jsx("tbody", { children: data.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: columnsToRender.length + 1, style: { textAlign: "center", padding: "20px" }, children: "No results" }) })) : (data.map((row, i) => (_jsxs("tr", { children: [_jsx("td", { style: { border: "1px solid #ccc", padding: "5px", position: "sticky", left: 0, background: "#fff" }, children: _jsx("button", { onClick: () => copyRow(row), style: { fontSize: "12px" }, children: "Copy" }) }), columnsToRender.map(col => (_jsx("td", { style: { border: "1px solid #ccc", padding: "5px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: formatValue(row[col.name], col.type) }, col.name)))] }, i)))) })] }) })] }));
}
function formatValue(value, type) {
    if (value === null || value === undefined)
        return "";
    if (type.includes("DateTime")) {
        const toMs = (v) => {
            if (v === null || v === undefined)
                return null;
            if (typeof v === "number") {
                // Detect seconds vs milliseconds
                if (v > 1e12)
                    return v; // already ms
                if (v > 1e9)
                    return Math.round(v * 1000); // seconds -> ms
                // Fallback assume ms
                return v;
            }
            if (typeof v === "string") {
                // Numeric string (possibly with fractions)
                if (/^\d+(\.\d+)?$/.test(v)) {
                    const num = parseFloat(v);
                    return num > 1e12 ? num : Math.round(num * 1000);
                }
                // Try ISO or "YYYY-MM-DD HH:MM:SS.mmm" -> make ISO
                const isoLike = v.includes("T") ? v : v.replace(" ", "T");
                const d1 = new Date(isoLike);
                if (!isNaN(d1.getTime()))
                    return d1.getTime();
                // Try appending Z to treat as UTC
                const d2 = new Date(isoLike + "Z");
                if (!isNaN(d2.getTime()))
                    return d2.getTime();
                return null;
            }
            return null;
        };
        const ms = toMs(value);
        if (ms === null)
            return "";
        return new Date(ms).toLocaleString();
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}
