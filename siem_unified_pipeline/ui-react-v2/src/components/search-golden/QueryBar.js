import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
/**
 * QueryBar - Input controls for search
 * Handles tenant, query, time range, and action buttons
 * Hotkeys: Enter = Run, Cmd/Ctrl+S = Save
 */
export default function QueryBar({ tenantId, query, time, onTenantChange, onQueryChange, onTimeChange, onCompile, onRun, onSave, onExport, saving, exporting, compiling, running, }) {
    const [showExportMenu, setShowExportMenu] = useState(false);
    // Handle hotkeys
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
                e.preventDefault();
                onRun();
            }
            else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                onCompile();
            }
            else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                const name = prompt("Save search as:");
                if (name)
                    onSave(name);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onRun, onSave]);
    const handleTimeRangeChange = (value) => {
        if (value === "custom") {
            // Use more user-friendly date inputs
            const fromDate = prompt("From date (YYYY-MM-DD HH:MM):");
            const toDate = prompt("To date (YYYY-MM-DD HH:MM):");
            if (fromDate && toDate) {
                try {
                    const fromTimestamp = Math.floor(new Date(fromDate).getTime() / 1000);
                    const toTimestamp = Math.floor(new Date(toDate).getTime() / 1000);
                    if (!isNaN(fromTimestamp) && !isNaN(toTimestamp)) {
                        onTimeChange({ from: fromTimestamp, to: toTimestamp });
                    }
                    else {
                        alert("Invalid date format. Please use YYYY-MM-DD HH:MM format.");
                    }
                }
                catch (err) {
                    alert("Invalid date format. Please use YYYY-MM-DD HH:MM format.");
                }
            }
        }
        else {
            onTimeChange({ last_seconds: parseInt(value) });
        }
    };
    return (_jsxs("div", { style: {
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            padding: "16px 24px",
            flexShrink: 0
        }, children: [_jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "200px 180px 1fr 120px 100px",
                    gap: "12px",
                    alignItems: "end",
                    marginBottom: "12px"
                }, children: [_jsxs("div", { children: [_jsx("label", { style: {
                                    display: "block",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    color: "#64748b",
                                    marginBottom: "4px"
                                }, children: "Tenant" }), _jsxs("select", { "aria-label": "Tenant", value: tenantId, onChange: e => onTenantChange(e.target.value), style: {
                                    padding: "8px 12px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "6px",
                                    fontSize: "14px",
                                    backgroundColor: "#ffffff",
                                    minWidth: "120px"
                                }, children: [_jsx("option", { value: "all", children: "All tenants" }), _jsx("option", { value: "default", children: "default" }), _jsx("option", { value: "1", children: "1" }), _jsx("option", { value: "hr", children: "hr" }), _jsx("option", { value: "finance", children: "finance" }), _jsx("option", { value: "engineering", children: "engineering" }), _jsx("option", { value: "sales", children: "sales" }), _jsx("option", { value: "marketing", children: "marketing" }), _jsx("option", { value: "ops", children: "ops" }), _jsx("option", { value: "security", children: "security" }), _jsx("option", { value: "admin", children: "admin" })] })] }), _jsxs("div", { children: [_jsx("label", { style: {
                                    display: "block",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    color: "#64748b",
                                    marginBottom: "4px"
                                }, children: "Time Range" }), _jsxs("select", { "aria-label": "time range", value: 'last_seconds' in time ? time.last_seconds : 'custom', onChange: e => handleTimeRangeChange(e.target.value), style: {
                                    padding: "8px 12px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "6px",
                                    fontSize: "14px",
                                    backgroundColor: "#ffffff",
                                    minWidth: "140px"
                                }, children: [_jsx("option", { value: "300", children: "Last 5 minutes" }), _jsx("option", { value: "600", children: "Last 10 minutes" }), _jsx("option", { value: "3600", children: "Last 1 hour" }), _jsx("option", { value: "86400", children: "Last 24 hours" }), _jsx("option", { value: "604800", children: "Last 7 days" }), _jsx("option", { value: "2592000", children: "Last 30 days" }), _jsx("option", { value: "7776000", children: "Last 90 days" }), _jsx("option", { value: "10368000", children: "Last 120 days" }), _jsx("option", { value: "21600000", children: "Last 250 days" }), _jsx("option", { value: "31536000", children: "Last 365 days" }), _jsx("option", { value: "315360000", children: "Last 10 years (test data)" }), _jsx("option", { value: "custom", children: "Custom range..." })] })] }), _jsxs("div", { children: [_jsx("label", { style: {
                                    display: "block",
                                    fontSize: "12px",
                                    fontWeight: 500,
                                    color: "#64748b",
                                    marginBottom: "4px"
                                }, children: "Search Query" }), _jsx("input", { type: "text", "aria-label": "query", value: query, onChange: e => onQueryChange(e.target.value), onKeyDown: e => {
                                    if (e.key === 'Enter') {
                                        if (e.metaKey || e.ctrlKey) {
                                            onCompile();
                                        }
                                        else {
                                            onRun();
                                        }
                                    }
                                }, placeholder: "Enter search terms or leave empty for all events...", style: {
                                    width: "100%",
                                    padding: "10px 12px",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "6px",
                                    fontSize: "14px",
                                    backgroundColor: "#ffffff",
                                    fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace"
                                } })] }), _jsx("button", { onClick: onCompile, disabled: !!compiling, style: {
                            backgroundColor: compiling ? "#e5e7eb" : "#3b82f6",
                            color: compiling ? "#9ca3af" : "white",
                            border: "none",
                            padding: "8px 16px",
                            borderRadius: "6px",
                            fontSize: "14px",
                            fontWeight: 500,
                            cursor: compiling ? "not-allowed" : "pointer",
                            transition: "all 0.2s"
                        }, children: compiling ? "Compiling…" : "Compile" }), _jsx("button", { onClick: onRun, disabled: !!running, style: {
                            backgroundColor: running ? "#e5e7eb" : "#10b981",
                            color: running ? "#9ca3af" : "white",
                            border: "none",
                            padding: "8px 16px",
                            borderRadius: "6px",
                            fontSize: "14px",
                            fontWeight: 500,
                            cursor: running ? "not-allowed" : "pointer",
                            transition: "all 0.2s"
                        }, children: running ? "Running…" : "Run" })] }), _jsxs("div", { style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: "12px",
                    borderTop: "1px solid #f1f5f9"
                }, children: [_jsx("div", { style: {
                            display: "flex",
                            gap: "16px",
                            alignItems: "center",
                            fontSize: "13px",
                            color: "#64748b"
                        }, children: _jsxs("span", { children: ["\uD83D\uDCA1 Hotkeys: ", _jsx("kbd", { style: {
                                        padding: "2px 6px",
                                        backgroundColor: "#f1f5f9",
                                        borderRadius: "3px",
                                        fontSize: "11px",
                                        fontFamily: "ui-monospace, monospace"
                                    }, children: "Enter" }), " = Run, ", _jsx("kbd", { style: {
                                        padding: "2px 6px",
                                        backgroundColor: "#f1f5f9",
                                        borderRadius: "3px",
                                        fontSize: "11px",
                                        fontFamily: "ui-monospace, monospace"
                                    }, children: "Cmd+Enter" }), " = Compile"] }) }), _jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, children: [_jsx("button", { onClick: () => {
                                    const name = prompt("Save search as:");
                                    if (name)
                                        onSave(name);
                                }, disabled: saving, style: {
                                    backgroundColor: saving ? "#f3f4f6" : "#ffffff",
                                    color: saving ? "#9ca3af" : "#374151",
                                    border: "1px solid #d1d5db",
                                    padding: "6px 12px",
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    cursor: saving ? "not-allowed" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px"
                                }, children: saving ? "Saving..." : "💾 Save" }), _jsxs("div", { style: { position: "relative" }, children: [_jsx("button", { onClick: () => setShowExportMenu(!showExportMenu), disabled: exporting, style: {
                                            backgroundColor: exporting ? "#f3f4f6" : "#ffffff",
                                            color: exporting ? "#9ca3af" : "#374151",
                                            border: "1px solid #d1d5db",
                                            padding: "6px 12px",
                                            borderRadius: "6px",
                                            fontSize: "12px",
                                            cursor: exporting ? "not-allowed" : "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "4px"
                                        }, children: exporting ? "Exporting..." : "📤 Export ▼" }), showExportMenu && (_jsxs("div", { style: {
                                            position: "absolute",
                                            top: "100%",
                                            right: 0,
                                            background: "white",
                                            border: "1px solid #d1d5db",
                                            borderRadius: "6px",
                                            padding: "4px 0",
                                            minWidth: "120px",
                                            zIndex: 1000,
                                            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)"
                                        }, children: [_jsx("button", { onClick: () => { onExport("csv"); setShowExportMenu(false); }, style: {
                                                    display: "block",
                                                    width: "100%",
                                                    textAlign: "left",
                                                    padding: "8px 12px",
                                                    border: "none",
                                                    backgroundColor: "transparent",
                                                    fontSize: "12px",
                                                    cursor: "pointer"
                                                }, children: "\uD83D\uDCC4 CSV" }), _jsx("button", { onClick: () => { onExport("ndjson"); setShowExportMenu(false); }, style: {
                                                    display: "block",
                                                    width: "100%",
                                                    textAlign: "left",
                                                    padding: "8px 12px",
                                                    border: "none",
                                                    backgroundColor: "transparent",
                                                    fontSize: "12px",
                                                    cursor: "pointer"
                                                }, children: "\uD83D\uDD27 NDJSON" }), _jsx("button", { onClick: () => { onExport("parquet"); setShowExportMenu(false); }, style: {
                                                    display: "block",
                                                    width: "100%",
                                                    textAlign: "left",
                                                    padding: "8px 12px",
                                                    border: "none",
                                                    backgroundColor: "transparent",
                                                    fontSize: "12px",
                                                    cursor: "pointer"
                                                }, children: "\uD83D\uDCE6 Parquet" })] }))] })] })] })] }));
}
