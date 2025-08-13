import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api-client";
/**
 * Live tail component with SSE streaming
 */
export default function LiveTail({ tenant, query, timeRange, selectedFields, onStop }) {
    const [events, setEvents] = useState([]);
    const [stats, setStats] = useState({ rows: 0, bytes: 0, elapsed_ms: 0 });
    const [isPaused, setIsPaused] = useState(false);
    const eventSourceRef = useRef(null);
    const containerRef = useRef(null);
    const streamId = useRef(`stream-${Date.now()}`);
    useEffect(() => {
        startStream();
        return () => stopStream();
    }, [tenant, query, timeRange, selectedFields]);
    const startStream = () => {
        stopStream();
        const es = api.search.tail({
            tenant_id: tenant,
            time: timeRange,
            q: query,
            select: selectedFields.length > 0 ? selectedFields : undefined,
            stream_id: streamId.current,
        });
        es.addEventListener("hello", (e) => {
            const data = JSON.parse(e.data);
            console.log("Stream started:", data);
        });
        es.addEventListener("row", (e) => {
            if (!isPaused) {
                const row = JSON.parse(e.data);
                setEvents(prev => [...prev.slice(-999), row]); // Keep last 1000
                // Auto-scroll to bottom
                if (containerRef.current) {
                    containerRef.current.scrollTop = containerRef.current.scrollHeight;
                }
            }
        });
        es.addEventListener("stats", (e) => {
            const stats = JSON.parse(e.data);
            setStats(stats);
        });
        es.addEventListener("warning", (e) => {
            const warning = JSON.parse(e.data);
            console.warn("Stream warning:", warning);
        });
        es.onerror = (e) => {
            console.error("Stream error:", e);
            stopStream();
        };
        eventSourceRef.current = es;
    };
    const stopStream = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
    };
    const handleClear = () => {
        setEvents([]);
        setStats({ rows: 0, bytes: 0, elapsed_ms: 0 });
    };
    const formatBytes = (bytes) => {
        if (bytes < 1024)
            return `${bytes} B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };
    return (_jsxs("div", { style: { height: "100%", display: "flex", flexDirection: "column" }, children: [_jsxs("div", { style: {
                    padding: "var(--space-md)",
                    borderBottom: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-md)",
                    backgroundColor: "var(--bg-secondary)",
                }, children: [_jsxs("div", { style: { display: "flex", gap: "var(--space-sm)" }, children: [_jsx("button", { onClick: () => setIsPaused(!isPaused), style: {
                                    padding: "var(--space-sm) var(--space-md)",
                                    backgroundColor: isPaused ? "var(--color-warning)" : "var(--color-success)",
                                }, children: isPaused ? "▶ Resume" : "⏸ Pause" }), _jsx("button", { onClick: handleClear, style: {
                                    padding: "var(--space-sm) var(--space-md)",
                                    backgroundColor: "var(--bg-tertiary)",
                                    color: "var(--text-primary)",
                                }, children: "Clear" }), _jsx("button", { onClick: onStop, style: {
                                    padding: "var(--space-sm) var(--space-md)",
                                    backgroundColor: "var(--color-error)",
                                }, children: "Stop Live Tail" })] }), _jsxs("div", { style: { marginLeft: "auto", display: "flex", gap: "var(--space-lg)", fontSize: "0.875rem" }, children: [_jsxs("span", { children: [_jsx("strong", { children: stats.rows.toLocaleString() }), " events"] }), _jsxs("span", { children: [_jsx("strong", { children: formatBytes(stats.bytes) }), " received"] }), _jsxs("span", { children: [_jsxs("strong", { children: [(stats.elapsed_ms / 1000).toFixed(1), "s"] }), " elapsed"] })] })] }), _jsx("div", { ref: containerRef, style: {
                    flex: 1,
                    overflow: "auto",
                    padding: "var(--space-md)",
                    backgroundColor: "var(--bg-tertiary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.875rem",
                }, children: events.length === 0 ? (_jsxs("div", { style: {
                        textAlign: "center",
                        padding: "var(--space-xl)",
                        color: "var(--text-tertiary)"
                    }, children: [_jsx("div", { style: { fontSize: "2rem", marginBottom: "var(--space-md)" }, children: "\uD83D\uDCE1" }), _jsx("p", { children: "Waiting for events matching your query..." }), _jsxs("p", { className: "text-sm", children: ["Query: ", _jsx("code", { children: query })] })] })) : (_jsx("div", { children: events.map((event, index) => (_jsx("div", { style: {
                            marginBottom: "var(--space-xs)",
                            padding: "var(--space-sm)",
                            backgroundColor: "var(--bg-primary)",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-color)",
                            wordBreak: "break-word",
                        }, children: selectedFields.length > 0 ? (
                        // Show only selected fields
                        _jsx("div", { style: { display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }, children: selectedFields.map(field => (_jsxs("span", { children: [_jsxs("span", { style: { color: "var(--text-tertiary)" }, children: [field, ":"] }), " ", _jsx("span", { style: {
                                            color: field === "severity" ? getSeverityColor(event[field]) : "inherit",
                                            fontWeight: field === "severity" ? 600 : 400,
                                        }, children: formatValue(event[field], field) })] }, field))) })) : (
                        // Show full JSON
                        _jsx("pre", { style: { margin: 0, overflow: "auto" }, children: JSON.stringify(event, null, 2) })) }, index))) })) })] }));
}
// Helper functions (reused from other components)
function formatValue(value, field) {
    if (value === null || value === undefined)
        return "";
    if (field.includes("timestamp") || field.includes("_at")) {
        const date = new Date(value * 1000);
        if (!isNaN(date.getTime())) {
            return date.toLocaleString();
        }
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}
function getSeverityColor(value) {
    switch (value?.toLowerCase()) {
        case "critical": return "var(--color-error)";
        case "high": return "var(--color-warning)";
        case "medium": return "var(--color-info)";
        case "low": return "var(--color-success)";
        default: return "inherit";
    }
}
