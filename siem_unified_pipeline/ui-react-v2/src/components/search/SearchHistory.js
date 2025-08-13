import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
/**
 * Search history sidebar with clear functionality
 */
export default function SearchHistory({ tenant, onSelect }) {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        loadHistory();
    }, [tenant]);
    const loadHistory = async () => {
        try {
            setIsLoading(true);
            const res = await api.history.list(tenant, 100);
            setHistory(res.items);
        }
        catch (err) {
            console.error("Failed to load history:", err);
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleDelete = async (id, e) => {
        e.stopPropagation();
        try {
            await api.history.delete(id);
            setHistory(history.filter(h => h.history_id !== id));
        }
        catch (err) {
            console.error("Failed to delete history item:", err);
        }
    };
    const handleClearAll = async () => {
        if (!confirm("Clear all search history?"))
            return;
        try {
            await api.history.clear();
            setHistory([]);
        }
        catch (err) {
            console.error("Failed to clear history:", err);
        }
    };
    const formatTimeAgo = (timestamp) => {
        const seconds = Math.floor(Date.now() / 1000 - timestamp);
        if (seconds < 60)
            return "just now";
        if (seconds < 3600)
            return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400)
            return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };
    const formatTimeRange = (time) => {
        if ('last_seconds' in time) {
            if (time.last_seconds < 3600)
                return `Last ${Math.floor(time.last_seconds / 60)} min`;
            if (time.last_seconds < 86400)
                return `Last ${Math.floor(time.last_seconds / 3600)} hours`;
            return `Last ${Math.floor(time.last_seconds / 86400)} days`;
        }
        else {
            return `${new Date(time.from * 1000).toLocaleDateString()} - ${new Date(time.to * 1000).toLocaleDateString()}`;
        }
    };
    if (isLoading) {
        return (_jsx("div", { style: { textAlign: "center", padding: "var(--space-lg)" }, children: _jsx("div", { className: "loading", children: "\u27F3" }) }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "var(--space-md)"
                }, children: [_jsx("h4", { style: { margin: 0, fontSize: "0.875rem", fontWeight: 600 }, children: "Recent Searches" }), history.length > 0 && (_jsx("button", { onClick: handleClearAll, style: {
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.75rem",
                            backgroundColor: "transparent",
                            border: "1px solid var(--border-color)",
                        }, children: "Clear All" }))] }), history.length === 0 ? (_jsx("div", { className: "text-sm text-tertiary", style: { textAlign: "center", padding: "var(--space-lg)" }, children: "No search history yet" })) : (_jsx("div", { children: history.map(item => (_jsxs("div", { onClick: () => onSelect(item), style: {
                        padding: "var(--space-sm)",
                        marginBottom: "var(--space-xs)",
                        borderRadius: "var(--radius-md)",
                        cursor: "pointer",
                        backgroundColor: "transparent",
                        transition: "all 0.2s",
                        border: "1px solid transparent",
                    }, onMouseEnter: (e) => {
                        e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                        e.currentTarget.style.borderColor = "var(--border-color)";
                    }, onMouseLeave: (e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.borderColor = "transparent";
                    }, children: [_jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: "var(--space-xs)"
                            }, children: [_jsx("code", { style: {
                                        fontSize: "0.875rem",
                                        flex: 1,
                                        wordBreak: "break-word",
                                        marginRight: "var(--space-sm)"
                                    }, children: item.q }), _jsx("button", { onClick: (e) => handleDelete(item.history_id, e), style: {
                                        padding: "0.125rem 0.25rem",
                                        fontSize: "0.75rem",
                                        backgroundColor: "transparent",
                                        border: "none",
                                        color: "var(--text-tertiary)",
                                        cursor: "pointer",
                                    }, onMouseEnter: (e) => {
                                        e.currentTarget.style.color = "var(--color-error)";
                                    }, onMouseLeave: (e) => {
                                        e.currentTarget.style.color = "var(--text-tertiary)";
                                    }, children: "\u2715" })] }), _jsxs("div", { style: {
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "0.75rem",
                                color: "var(--text-tertiary)"
                            }, children: [_jsx("span", { children: formatTimeRange(item.time) }), _jsx("span", { children: formatTimeAgo(item.executed_at) })] }), item.result_count !== undefined && (_jsxs("div", { style: {
                                fontSize: "0.75rem",
                                color: "var(--text-tertiary)",
                                marginTop: "var(--space-xs)"
                            }, children: [item.result_count.toLocaleString(), " results"] }))] }, item.history_id))) }))] }));
}
