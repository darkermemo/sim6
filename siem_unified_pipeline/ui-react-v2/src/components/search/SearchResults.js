import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import React, { useState, useMemo } from "react";
/**
 * Advanced search results table with column selection, sorting, and pagination
 */
export default function SearchResults({ results, selectedFields, onFieldsChange, onSort, onLoadMore, hasMore, }) {
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [showFieldSelector, setShowFieldSelector] = useState(false);
    // Get display columns (selected fields or all fields)
    const displayColumns = useMemo(() => {
        if (selectedFields.length > 0) {
            return results.data.meta.filter(m => selectedFields.includes(m.name));
        }
        return results.data.meta;
    }, [results.data.meta, selectedFields]);
    // Toggle row expansion
    const toggleRowExpansion = (index) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        }
        else {
            newExpanded.add(index);
        }
        setExpandedRows(newExpanded);
    };
    // Handle column sort
    const handleSort = (field) => {
        onSort([{ field, dir: "desc" }]); // Simple toggle for now
    };
    // Format cell value
    const formatValue = (value, field) => {
        if (value === null || value === undefined)
            return "";
        // Format timestamps
        if (field.includes("timestamp") || field.includes("_at")) {
            const date = new Date(value * 1000);
            if (!isNaN(date.getTime())) {
                return date.toLocaleString();
            }
        }
        // Format JSON
        if (typeof value === "object") {
            return JSON.stringify(value);
        }
        return String(value);
    };
    // Get severity color
    const getSeverityColor = (value) => {
        switch (value?.toLowerCase()) {
            case "critical": return "var(--color-error)";
            case "high": return "var(--color-warning)";
            case "medium": return "var(--color-info)";
            case "low": return "var(--color-success)";
            default: return "inherit";
        }
    };
    return (_jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column" }, children: [_jsxs("div", { style: {
                    padding: "var(--space-sm) var(--space-md)",
                    borderBottom: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-md)",
                    backgroundColor: "var(--bg-secondary)",
                }, children: [_jsxs("span", { className: "text-sm", children: ["Showing ", results.data.data.length, " of ", results.data.rows_before_limit_at_least || results.data.rows, " events"] }), _jsxs("div", { style: { marginLeft: "auto", position: "relative" }, children: [_jsxs("button", { onClick: () => setShowFieldSelector(!showFieldSelector), style: {
                                    padding: "var(--space-xs) var(--space-sm)",
                                    fontSize: "0.875rem",
                                }, children: ["\u2699\uFE0F Columns (", displayColumns.length, ")"] }), showFieldSelector && (_jsx("div", { style: {
                                    position: "absolute",
                                    top: "100%",
                                    right: 0,
                                    backgroundColor: "var(--bg-primary)",
                                    border: "1px solid var(--border-color)",
                                    borderRadius: "var(--radius-md)",
                                    boxShadow: "var(--shadow-lg)",
                                    minWidth: "200px",
                                    maxHeight: "400px",
                                    overflow: "auto",
                                    zIndex: 1000,
                                    marginTop: "var(--space-xs)",
                                }, children: _jsxs("div", { style: { padding: "var(--space-sm)" }, children: [_jsxs("label", { style: { display: "flex", alignItems: "center", marginBottom: "var(--space-xs)" }, children: [_jsx("input", { type: "checkbox", checked: selectedFields.length === 0, onChange: () => onFieldsChange([]), style: { marginRight: "var(--space-xs)" } }), _jsx("span", { className: "text-sm", children: "Show all fields" })] }), results.data.meta.map(field => (_jsxs("label", { style: { display: "flex", alignItems: "center", marginBottom: "var(--space-xs)" }, children: [_jsx("input", { type: "checkbox", checked: selectedFields.length === 0 || selectedFields.includes(field.name), onChange: (e) => {
                                                        if (e.target.checked) {
                                                            onFieldsChange([...selectedFields, field.name]);
                                                        }
                                                        else {
                                                            onFieldsChange(selectedFields.filter(f => f !== field.name));
                                                        }
                                                    }, disabled: selectedFields.length === 0, style: { marginRight: "var(--space-xs)" } }), _jsx("span", { className: "text-sm", children: field.name })] }, field.name)))] }) }))] })] }), _jsx("div", { style: { flex: 1, overflow: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "separate", borderSpacing: 0 }, children: [_jsx("thead", { style: { position: "sticky", top: 0, backgroundColor: "var(--bg-secondary)", zIndex: 10 }, children: _jsxs("tr", { children: [_jsx("th", { style: { width: "40px", padding: "var(--space-sm)" } }), displayColumns.map(col => (_jsxs("th", { onClick: () => handleSort(col.name), style: {
                                            padding: "var(--space-sm)",
                                            textAlign: "left",
                                            cursor: "pointer",
                                            userSelect: "none",
                                            borderBottom: "2px solid var(--border-color)",
                                        }, children: [col.name, _jsx("span", { style: { marginLeft: "var(--space-xs)", opacity: 0.5 }, children: "\u2195" })] }, col.name)))] }) }), _jsx("tbody", { children: results.data.data.map((row, index) => (_jsxs(React.Fragment, { children: [_jsxs("tr", { style: {
                                            backgroundColor: index % 2 === 0 ? "transparent" : "var(--bg-secondary)",
                                            cursor: "pointer",
                                        }, onClick: () => toggleRowExpansion(index), children: [_jsx("td", { style: { padding: "var(--space-sm)", textAlign: "center" }, children: expandedRows.has(index) ? "▼" : "▶" }), displayColumns.map(col => (_jsx("td", { style: {
                                                    padding: "var(--space-sm)",
                                                    color: col.name === "severity" ? getSeverityColor(row[col.name]) : "inherit",
                                                    fontWeight: col.name === "severity" ? 600 : 400,
                                                }, children: formatValue(row[col.name], col.name) }, col.name)))] }), expandedRows.has(index) && (_jsx("tr", { children: _jsx("td", { colSpan: displayColumns.length + 1, style: {
                                                padding: "var(--space-md)",
                                                backgroundColor: "var(--bg-tertiary)",
                                            }, children: _jsx("pre", { style: {
                                                    margin: 0,
                                                    fontSize: "0.875rem",
                                                    overflow: "auto",
                                                    maxHeight: "300px",
                                                }, children: JSON.stringify(row, null, 2) }) }) }))] }, index))) })] }) }), hasMore && (_jsx("div", { style: {
                    padding: "var(--space-md)",
                    textAlign: "center",
                    borderTop: "1px solid var(--border-color)",
                }, children: _jsx("button", { onClick: onLoadMore, children: "Load More Results" }) }))] }));
}
