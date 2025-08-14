import { useState, useEffect } from "react";
// TODO: Implement using centralized HTTP helper
import * as Types from "@/lib/api-types";

interface Props {
  tenant: string;
  onSelect: (saved: Types.SavedSearch) => void;
}

/**
 * Saved searches management with CRUD operations
 */
export default function SavedSearches({ tenant, onSelect }: Props) {
  const [searches, setSearches] = useState<Types.SavedSearch[]>([]);
  const [pins, setPins] = useState<Types.Pin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    loadSavedSearches();
  }, [tenant]);

  const loadSavedSearches = async () => {
    try {
      setIsLoading(true);
      const [savedRes, pinsRes] = await Promise.all([
        api.saved.list(tenant, 50),
        api.pins.list(tenant),
      ]);
      setSearches(savedRes.items);
      setPins(pinsRes.items);
    } catch (err) {
      console.error("Failed to load saved searches:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePin = async (searchId: string) => {
    try {
      const isPinned = pins.some(p => p.saved_search_id === searchId);
      if (isPinned) {
        const pin = pins.find(p => p.saved_search_id === searchId);
        if (pin) {
          await api.pins.delete(pin.pin_id);
          setPins(pins.filter(p => p.pin_id !== pin.pin_id));
        }
      } else {
        const res = await api.pins.create(tenant, searchId);
        setPins([...pins, { 
          pin_id: res.pin_id, 
          tenant_id: tenant, 
          saved_search_id: searchId,
          created_at: Date.now() / 1000
        }]);
      }
    } catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    
    try {
      await api.saved.update(id, { name: editName });
      setSearches(searches.map(s => 
        s.saved_search_id === id ? { ...s, name: editName } : s
      ));
      setEditingId(null);
    } catch (err) {
      console.error("Failed to rename search:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this saved search?")) return;
    
    try {
      await api.saved.delete(id);
      setSearches(searches.filter(s => s.saved_search_id !== id));
      setPins(pins.filter(p => p.saved_search_id !== id));
    } catch (err) {
      console.error("Failed to delete search:", err);
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // Sort searches: pinned first, then by updated_at
  const sortedSearches = [...searches].sort((a, b) => {
    const aPinned = pins.some(p => p.saved_search_id === a.saved_search_id);
    const bPinned = pins.some(p => p.saved_search_id === b.saved_search_id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return b.updated_at - a.updated_at;
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: "var(--space-lg)" }}>
        <div className="loading">⟳</div>
      </div>
    );
  }

  return (
    <div>
      <h4 style={{ 
        margin: 0, 
        marginBottom: "var(--space-md)",
        fontSize: "0.875rem", 
        fontWeight: 600 
      }}>
        Saved Searches
      </h4>

      {searches.length === 0 ? (
        <div className="text-sm text-tertiary" style={{ textAlign: "center", padding: "var(--space-lg)" }}>
          No saved searches yet
        </div>
      ) : (
        <div>
          {sortedSearches.map(search => {
            const isPinned = pins.some(p => p.saved_search_id === search.saved_search_id);
            const isEditing = editingId === search.saved_search_id;
            
            return (
              <div
                key={search.saved_search_id}
                style={{
                  padding: "var(--space-sm)",
                  marginBottom: "var(--space-sm)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-color)",
                  backgroundColor: isPinned ? "var(--bg-secondary)" : "var(--bg-primary)",
                }}
              >
                <div style={{ 
                  display: "flex", 
                  alignItems: "center",
                  gap: "var(--space-sm)",
                  marginBottom: "var(--space-xs)"
                }}>
                  <button
                    onClick={() => handlePin(search.saved_search_id)}
                    style={{
                      padding: "0.25rem",
                      fontSize: "1rem",
                      backgroundColor: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: isPinned ? "var(--color-warning)" : "var(--text-tertiary)",
                    }}
                    title={isPinned ? "Unpin" : "Pin to top"}
                  >
                    {isPinned ? "⭐" : "☆"}
                  </button>
                  
                  {isEditing ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(search.saved_search_id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleRename(search.saved_search_id)}
                      style={{
                        flex: 1,
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.875rem",
                      }}
                      autoFocus
                    />
                  ) : (
                    <div
                      onClick={() => onSelect(search)}
                      style={{
                        flex: 1,
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                      }}
                    >
                      {search.name}
                    </div>
                  )}
                  
                  <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                    <button
                      onClick={() => {
                        setEditingId(search.saved_search_id);
                        setEditName(search.name);
                      }}
                      style={{
                        padding: "0.25rem",
                        fontSize: "0.75rem",
                        backgroundColor: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-tertiary)",
                      }}
                      title="Rename"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(search.saved_search_id)}
                      style={{
                        padding: "0.25rem",
                        fontSize: "0.75rem",
                        backgroundColor: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-tertiary)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--color-error)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-tertiary)";
                      }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                <div style={{ 
                  fontSize: "0.75rem",
                  color: "var(--text-tertiary)",
                  marginLeft: "calc(1rem + var(--space-sm))"
                }}>
                  <code>{search.q}</code>
                </div>
                
                <div style={{ 
                  fontSize: "0.75rem",
                  color: "var(--text-tertiary)",
                  marginTop: "var(--space-xs)",
                  marginLeft: "calc(1rem + var(--space-sm))"
                }}>
                  Updated {formatDate(search.updated_at)}
                  {search.shared_with && search.shared_with.length > 0 && (
                    <span> • Shared with {search.shared_with.length}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
