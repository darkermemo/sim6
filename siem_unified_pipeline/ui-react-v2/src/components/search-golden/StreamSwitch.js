import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api-golden";
/**
 * StreamSwitch - Toggles SSE tail and displays status
 * Shows row and warning events from the stream
 */
export default function StreamSwitch({ enabled, connected, lastEventTs, onToggle, tenantId, query, time, onStatusUpdate, }) {
    const eventSourceRef = useRef(null);
    const eventsRef = useRef(null);
    useEffect(() => {
        if (enabled) {
            startStream();
        }
        else {
            stopStream();
        }
        return () => stopStream();
    }, [enabled, tenantId, query, time]);
    const startStream = () => {
        stopStream();
        const es = api.search.tail({
            tenant_id: tenantId,
            time,
            q: query,
        });
        es.onopen = () => {
            onStatusUpdate(true);
            appendEvent("info", "Connected to stream");
        };
        es.addEventListener("row", (e) => {
            const data = JSON.parse(e.data);
            appendEvent("row", JSON.stringify(data, null, 2));
            onStatusUpdate(true, Date.now());
        });
        es.addEventListener("warning", (e) => {
            const data = JSON.parse(e.data);
            appendEvent("warning", data.message);
        });
        es.addEventListener("watermark", (e) => {
            const data = JSON.parse(e.data);
            onStatusUpdate(true, data.ts);
        });
        es.onerror = () => {
            onStatusUpdate(false);
            appendEvent("error", "Stream disconnected");
        };
        eventSourceRef.current = es;
    };
    const stopStream = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            onStatusUpdate(false);
        }
    };
    const appendEvent = (type, message) => {
        if (!eventsRef.current)
            return;
        const div = document.createElement("div");
        div.style.marginBottom = "5px";
        div.style.padding = "5px";
        div.style.borderRadius = "3px";
        switch (type) {
            case "info":
                div.style.backgroundColor = "#e3f2fd";
                div.style.color = "#1976d2";
                break;
            case "warning":
                div.style.backgroundColor = "#fff3e0";
                div.style.color = "#f57c00";
                break;
            case "error":
                div.style.backgroundColor = "#ffebee";
                div.style.color = "#c62828";
                break;
            default:
                div.style.backgroundColor = "#f5f5f5";
        }
        div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        eventsRef.current.appendChild(div);
        // Keep only last 100 events
        while (eventsRef.current.children.length > 100) {
            eventsRef.current.removeChild(eventsRef.current.firstChild);
        }
        // Auto-scroll to bottom
        eventsRef.current.scrollTop = eventsRef.current.scrollHeight;
    };
    return (_jsxs("div", { style: { padding: "10px", borderBottom: "1px solid #ccc" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", marginBottom: "10px" }, children: [_jsxs("label", { style: { display: "flex", alignItems: "center" }, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": "live tail", checked: enabled, onChange: e => onToggle(e.target.checked) }), _jsx("span", { style: { marginLeft: "5px" }, children: "Live Tail" })] }), _jsxs("div", { "data-testid": "tail-status", style: { marginLeft: "20px" }, children: ["Status: ", connected ? "Connected" : enabled ? "Connecting..." : "Disconnected", lastEventTs && (_jsxs("span", { style: { marginLeft: "10px", color: "#666" }, children: ["Last event: ", new Date(lastEventTs).toLocaleTimeString()] }))] })] }), enabled && (_jsx("div", { ref: eventsRef, style: {
                    height: "200px",
                    overflow: "auto",
                    border: "1px solid #ddd",
                    borderRadius: "3px",
                    padding: "5px",
                    backgroundColor: "#fafafa",
                    fontFamily: "monospace",
                    fontSize: "12px",
                } }))] }));
}
