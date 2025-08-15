import { useState, useEffect } from "react";
import { api } from "@/lib/api-golden";
import * as Types from "@/lib/search-types";

interface Props {
  tenantId: string;
  onLoad: (saved: Types.SavedSearch) => void;
}

/**
 * SavedSearchBar - List, pin, open, save, delete saved searches
 */
export default function SavedSearchBar({ tenantId, onLoad }: Props) {
  const [searches, setSearches] = useState<Types.SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSearches();
  }, [tenantId]);

  const loadSearches = async () => {
    try {
      setLoading(true);
      const res = await api.saved.list(tenantId);
      setSearches(res?.items || []);
    } catch (err) {
      console.error("Failed to load saved searches:", err);
      setSearches([]); // Safe fallback
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this saved search?")) return;
    
    try {
      await api.saved.delete(id);
      await loadSearches();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleRename = async (saved: Types.SavedSearch) => {
    const newName = prompt("New name:", saved.name);
    if (!newName || newName === saved.name) return;
    
    try {
      await api.saved.update(saved.saved_id, { name: newName });
      await loadSearches();
    } catch (err) {
      console.error("Failed to rename:", err);
    }
  };

  return (
    <div style={{ padding: "6px 8px", flex: 1, overflow: "auto", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)" }}>
      <h3 style={{ margin: "0 0 6px 0", fontSize: "12px", fontWeight: "600", color: "var(--fg-muted)" }}>Saved Searches</h3>
      
      {loading ? (
        <div style={{ fontSize: "10px", color: "var(--fg-muted)" }}>Loading...</div>
      ) : !searches || searches.length === 0 ? (
        <div style={{ color: "var(--fg-muted)", fontSize: "10px" }}>No saved searches</div>
      ) : (
        <div>
          {(searches || []).map(saved => (
            <div 
              key={saved.saved_id}
              style={{
                padding: "3px",
                marginBottom: "3px",
                border: "1px solid var(--border)",
                borderRadius: "2px",
                backgroundColor: "var(--muted)"
              }}
            >
              <div style={{ fontWeight: "600", fontSize: "10px", color: "var(--fg)" }}>{saved.name}</div>
              <div style={{ fontSize: "9px", color: "var(--fg-muted)", marginBottom: "2px" }}>
                {saved.q.length > 30 ? saved.q.substring(0, 30) + '...' : saved.q}
              </div>
              <div style={{ display: "flex", gap: "2px" }}>
                <button 
                  onClick={() => onLoad(saved)}
                  style={{ 
                    padding: "1px 4px", 
                    fontSize: "9px", 
                    border: "1px solid #d1d5db", 
                    borderRadius: "2px", 
                    backgroundColor: "#3b82f6", 
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Load
                </button>
                <button 
                  onClick={() => handleRename(saved)}
                  style={{ 
                    padding: "1px 4px", 
                    fontSize: "9px", 
                    border: "1px solid #d1d5db", 
                    borderRadius: "2px", 
                    backgroundColor: "#f3f4f6", 
                    color: "#374151",
                    cursor: "pointer"
                  }}
                >
                  Rename
                </button>
                <button 
                  onClick={() => handleDelete(saved.saved_id)}
                  style={{ 
                    padding: "1px 4px", 
                    fontSize: "9px", 
                    border: "1px solid #d1d5db", 
                    borderRadius: "2px", 
                    backgroundColor: "#ef4444", 
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
