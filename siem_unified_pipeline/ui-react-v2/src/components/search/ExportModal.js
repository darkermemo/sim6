import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
/**
 * Export modal for downloading search results
 */
export default function ExportModal({ onExport, onClose, estimatedRows }) {
    const [format, setFormat] = useState("csv");
    const [maxRows, setMaxRows] = useState(10000);
    const formats = [
        {
            value: "csv",
            label: "CSV",
            description: "Comma-separated values, compatible with Excel"
        },
        {
            value: "ndjson",
            label: "NDJSON",
            description: "Newline-delimited JSON, one event per line"
        },
        {
            value: "parquet",
            label: "Parquet",
            description: "Columnar format for big data processing"
        },
    ];
    const handleExport = () => {
        onExport(format, maxRows);
        onClose();
    };
    return (_jsx("div", { style: {
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
        }, children: _jsxs("div", { style: {
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-xl)",
                minWidth: "400px",
                maxWidth: "500px",
                boxShadow: "var(--shadow-lg)",
            }, children: [_jsx("h3", { style: { marginBottom: "var(--space-lg)" }, children: "Export Search Results" }), _jsxs("div", { style: { marginBottom: "var(--space-lg)" }, children: [_jsx("label", { style: {
                                display: "block",
                                marginBottom: "var(--space-sm)",
                                fontWeight: 500,
                                fontSize: "0.875rem"
                            }, children: "Format" }), formats.map(fmt => (_jsxs("label", { style: {
                                display: "block",
                                padding: "var(--space-sm)",
                                marginBottom: "var(--space-xs)",
                                border: "1px solid var(--border-color)",
                                borderRadius: "var(--radius-md)",
                                cursor: "pointer",
                                backgroundColor: format === fmt.value ? "var(--bg-secondary)" : "transparent",
                                transition: "all 0.2s",
                            }, children: [_jsx("input", { type: "radio", name: "format", value: fmt.value, checked: format === fmt.value, onChange: (e) => setFormat(e.target.value), style: { marginRight: "var(--space-sm)" } }), _jsx("strong", { children: fmt.label }), _jsx("div", { style: {
                                        marginLeft: "1.5rem",
                                        fontSize: "0.875rem",
                                        color: "var(--text-secondary)"
                                    }, children: fmt.description })] }, fmt.value)))] }), _jsxs("div", { style: { marginBottom: "var(--space-lg)" }, children: [_jsx("label", { style: {
                                display: "block",
                                marginBottom: "var(--space-sm)",
                                fontWeight: 500,
                                fontSize: "0.875rem"
                            }, children: "Maximum Rows" }), _jsx("input", { type: "number", value: maxRows, onChange: (e) => setMaxRows(Math.max(1, Math.min(1000000, parseInt(e.target.value) || 0))), min: 1, max: 1000000, style: { width: "100%" } }), _jsxs("div", { style: {
                                marginTop: "var(--space-xs)",
                                fontSize: "0.75rem",
                                color: "var(--text-tertiary)"
                            }, children: ["Estimated ", estimatedRows.toLocaleString(), " total events available"] })] }), _jsxs("div", { style: {
                        display: "flex",
                        gap: "var(--space-md)",
                        justifyContent: "flex-end"
                    }, children: [_jsx("button", { onClick: onClose, style: {
                                backgroundColor: "var(--bg-tertiary)",
                                color: "var(--text-primary)",
                            }, children: "Cancel" }), _jsxs("button", { onClick: handleExport, children: ["Export ", format.toUpperCase()] })] })] }) }));
}
