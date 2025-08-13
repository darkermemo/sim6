import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { api } from "@/lib/api-golden";
/**
 * SavedSearchBar - List, pin, open, save, delete saved searches
 */
export default function SavedSearchBar({ tenantId, onLoad }) {
    const [searches, setSearches] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        loadSearches();
    }, [tenantId]);
    const loadSearches = async () => {
        try {
            setLoading(true);
            const res = await api.saved.list(tenantId);
            setSearches(res?.items || []);
        }
        catch (err) {
            console.error("Failed to load saved searches:", err);
            setSearches([]); // Safe fallback
        }
        finally {
            setLoading(false);
        }
    };
    const handleDelete = async (id) => {
        if (!confirm("Delete this saved search?"))
            return;
        try {
            await api.saved.delete(id);
            await loadSearches();
        }
        catch (err) {
            console.error("Failed to delete:", err);
        }
    };
    const handleRename = async (saved) => {
        const newName = prompt("New name:", saved.name);
        if (!newName || newName === saved.name)
            return;
        try {
            await api.saved.update(saved.saved_id, { name: newName });
            await loadSearches();
        }
        catch (err) {
            console.error("Failed to rename:", err);
        }
    };
    return (_jsxs("div", { style: { padding: "10px", flex: 1, overflow: "auto" }, children: [_jsx("h3", { children: "Saved Searches" }), loading ? (_jsx("div", { children: "Loading..." })) : !searches || searches.length === 0 ? (_jsx("div", { style: { color: "#666" }, children: "No saved searches" })) : (_jsx("div", { children: (searches || []).map(saved => (_jsxs("div", { style: {
                        padding: "5px",
                        marginBottom: "5px",
                        border: "1px solid #ddd",
                        borderRadius: "3px",
                    }, children: [_jsx("div", { style: { fontWeight: "bold" }, children: saved.name }), _jsx("div", { style: { fontSize: "12px", color: "#666" }, children: saved.q }), _jsxs("div", { style: { marginTop: "5px" }, children: [_jsx("button", { onClick: () => onLoad(saved), style: { marginRight: "5px", fontSize: "12px" }, children: "Load" }), _jsx("button", { onClick: () => handleRename(saved), style: { marginRight: "5px", fontSize: "12px" }, children: "Rename" }), _jsx("button", { onClick: () => handleDelete(saved.saved_id), style: { fontSize: "12px" }, children: "Delete" })] })] }, saved.saved_id))) }))] }));
}
