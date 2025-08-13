import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import * as Types from "@/lib/api-types";

interface Props {
  tenant: string;
  onSelect: (item: Types.SearchHistoryItem) => void;
}

/**
 * Search history sidebar with clear functionality
 */
export default function SearchHistory({ tenant, onSelect }: Props) {
  const [history, setHistory] = useState<Types.SearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [tenant]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      const res = await api.history.list(tenant, 100);
      setHistory(res.items);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.history.delete(id);
      setHistory(history.filter(h => h.history_id !== id));
    } catch (err) {
      console.error("Failed to delete history item:", err);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Clear all search history?")) return;
    
    try {
      await api.history.clear();
      setHistory([]);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const formatTimeRange = (time: Types.TimeRange): string => {
    if ('last_seconds' in time) {
      if (time.last_seconds < 3600) return `Last ${Math.floor(time.last_seconds / 60)} min`;
      if (time.last_seconds < 86400) return `Last ${Math.floor(time.last_seconds / 3600)} hours`;
      return `Last ${Math.floor(time.last_seconds / 86400)} days`;
    } else {
      return `${new Date(time.from * 1000).toLocaleDateString()} - ${new Date(time.to * 1000).toLocaleDateString()}`;
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: "center", padding: "var(--space-lg)" }}>
        <div className="loading">⟳</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "var(--space-md)"
      }}>
        <h4 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600 }}>
          Recent Searches
        </h4>
        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              backgroundColor: "transparent",
              border: "1px solid var(--border-color)",
            }}
          >
            Clear All
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-sm text-tertiary" style={{ textAlign: "center", padding: "var(--space-lg)" }}>
          No search history yet
        </div>
      ) : (
        <div>
          {history.map(item => (
            <div
              key={item.history_id}
              onClick={() => onSelect(item)}
              style={{
                padding: "var(--space-sm)",
                marginBottom: "var(--space-xs)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                backgroundColor: "transparent",
                transition: "all 0.2s",
                border: "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                e.currentTarget.style.borderColor = "var(--border-color)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "transparent";
              }}
            >
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "flex-start",
                marginBottom: "var(--space-xs)"
              }}>
                <code style={{ 
                  fontSize: "0.875rem", 
                  flex: 1,
                  wordBreak: "break-word",
                  marginRight: "var(--space-sm)"
                }}>
                  {item.q}
                </code>
                <button
                  onClick={(e) => handleDelete(item.history_id, e)}
                  style={{
                    padding: "0.125rem 0.25rem",
                    fontSize: "0.75rem",
                    backgroundColor: "transparent",
                    border: "none",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--color-error)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-tertiary)";
                  }}
                >
                  ✕
                </button>
              </div>
              
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between",
                fontSize: "0.75rem",
                color: "var(--text-tertiary)"
              }}>
                <span>{formatTimeRange(item.time)}</span>
                <span>{formatTimeAgo(item.executed_at)}</span>
              </div>
              
              {item.result_count !== undefined && (
                <div style={{ 
                  fontSize: "0.75rem", 
                  color: "var(--text-tertiary)",
                  marginTop: "var(--space-xs)"
                }}>
                  {item.result_count.toLocaleString()} results
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
