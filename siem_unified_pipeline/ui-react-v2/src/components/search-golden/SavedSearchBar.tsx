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
    <div style={{ padding: "10px", flex: 1, overflow: "auto" }}>
      <h3>Saved Searches</h3>
      
      {loading ? (
        <div>Loading...</div>
      ) : !searches || searches.length === 0 ? (
        <div style={{ color: "#666" }}>No saved searches</div>
      ) : (
        <div>
          {(searches || []).map(saved => (
            <div 
              key={saved.saved_id}
              style={{
                padding: "5px",
                marginBottom: "5px",
                border: "1px solid #ddd",
                borderRadius: "3px",
              }}
            >
              <div style={{ fontWeight: "bold" }}>{saved.name}</div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                {saved.q}
              </div>
              <div style={{ marginTop: "5px" }}>
                <button 
                  onClick={() => onLoad(saved)}
                  style={{ marginRight: "5px", fontSize: "12px" }}
                >
                  Load
                </button>
                <button 
                  onClick={() => handleRename(saved)}
                  style={{ marginRight: "5px", fontSize: "12px" }}
                >
                  Rename
                </button>
                <button 
                  onClick={() => handleDelete(saved.saved_id)}
                  style={{ fontSize: "12px" }}
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
