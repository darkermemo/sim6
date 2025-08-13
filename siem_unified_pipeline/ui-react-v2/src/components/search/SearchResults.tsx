import React, { useState, useMemo } from "react";
import * as Types from "@/lib/api-types";

interface Props {
  results: Types.SearchExecuteResponse;
  selectedFields: string[];
  onFieldsChange: (fields: string[]) => void;
  onSort: (sort: Types.Sort[]) => void;
  onLoadMore: () => void;
  hasMore: boolean;
}

/**
 * Advanced search results table with column selection, sorting, and pagination
 */
export default function SearchResults({
  results,
  selectedFields,
  onFieldsChange,
  onSort,
  onLoadMore,
  hasMore,
}: Props) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showFieldSelector, setShowFieldSelector] = useState(false);

  // Get display columns (selected fields or all fields)
  const displayColumns = useMemo(() => {
    if (selectedFields.length > 0) {
      return results.data.meta.filter(m => selectedFields.includes(m.name));
    }
    return results.data.meta;
  }, [results.data.meta, selectedFields]);

  // Toggle row expansion
  const toggleRowExpansion = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  // Handle column sort
  const handleSort = (field: string) => {
    onSort([{ field, dir: "desc" }]); // Simple toggle for now
  };

  // Format cell value
  const formatValue = (value: any, field: string): string => {
    if (value === null || value === undefined) return "";
    
    // Format timestamps
    if (field.includes("timestamp") || field.includes("_at")) {
      const date = new Date(value * 1000);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString();
      }
    }
    
    // Format JSON
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    
    return String(value);
  };

  // Get severity color
  const getSeverityColor = (value: string): string => {
    switch (value?.toLowerCase()) {
      case "critical": return "var(--color-error)";
      case "high": return "var(--color-warning)";
      case "medium": return "var(--color-info)";
      case "low": return "var(--color-success)";
      default: return "inherit";
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{
        padding: "var(--space-sm) var(--space-md)",
        borderBottom: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-md)",
        backgroundColor: "var(--bg-secondary)",
      }}>
        <span className="text-sm">
          Showing {results.data.data.length} of {results.data.rows_before_limit_at_least || results.data.rows} events
        </span>
        
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <button
            onClick={() => setShowFieldSelector(!showFieldSelector)}
            style={{
              padding: "var(--space-xs) var(--space-sm)",
              fontSize: "0.875rem",
            }}
          >
            ⚙️ Columns ({displayColumns.length})
          </button>
          
          {/* Field selector dropdown */}
          {showFieldSelector && (
            <div style={{
              position: "absolute",
              top: "100%",
              right: 0,
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-lg)",
              minWidth: "200px",
              maxHeight: "400px",
              overflow: "auto",
              zIndex: 1000,
              marginTop: "var(--space-xs)",
            }}>
              <div style={{ padding: "var(--space-sm)" }}>
                <label style={{ display: "flex", alignItems: "center", marginBottom: "var(--space-xs)" }}>
                  <input
                    type="checkbox"
                    checked={selectedFields.length === 0}
                    onChange={() => onFieldsChange([])}
                    style={{ marginRight: "var(--space-xs)" }}
                  />
                  <span className="text-sm">Show all fields</span>
                </label>
                
                {results.data.meta.map(field => (
                  <label key={field.name} style={{ display: "flex", alignItems: "center", marginBottom: "var(--space-xs)" }}>
                    <input
                      type="checkbox"
                      checked={selectedFields.length === 0 || selectedFields.includes(field.name)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onFieldsChange([...selectedFields, field.name]);
                        } else {
                          onFieldsChange(selectedFields.filter(f => f !== field.name));
                        }
                      }}
                      disabled={selectedFields.length === 0}
                      style={{ marginRight: "var(--space-xs)" }}
                    />
                    <span className="text-sm">{field.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead style={{ position: "sticky", top: 0, backgroundColor: "var(--bg-secondary)", zIndex: 10 }}>
            <tr>
              <th style={{ width: "40px", padding: "var(--space-sm)" }}></th>
              {displayColumns.map(col => (
                <th
                  key={col.name}
                  onClick={() => handleSort(col.name)}
                  style={{
                    padding: "var(--space-sm)",
                    textAlign: "left",
                    cursor: "pointer",
                    userSelect: "none",
                    borderBottom: "2px solid var(--border-color)",
                  }}
                >
                  {col.name}
                  <span style={{ marginLeft: "var(--space-xs)", opacity: 0.5 }}>↕</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.data.data.map((row, index) => (
              <React.Fragment key={index}>
                <tr
                  style={{
                    backgroundColor: index % 2 === 0 ? "transparent" : "var(--bg-secondary)",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleRowExpansion(index)}
                >
                  <td style={{ padding: "var(--space-sm)", textAlign: "center" }}>
                    {expandedRows.has(index) ? "▼" : "▶"}
                  </td>
                  {displayColumns.map(col => (
                    <td
                      key={col.name}
                      style={{
                        padding: "var(--space-sm)",
                        color: col.name === "severity" ? getSeverityColor(row[col.name]) : "inherit",
                        fontWeight: col.name === "severity" ? 600 : 400,
                      }}
                    >
                      {formatValue(row[col.name], col.name)}
                    </td>
                  ))}
                </tr>
                
                {/* Expanded row details */}
                {expandedRows.has(index) && (
                  <tr>
                    <td colSpan={displayColumns.length + 1} style={{
                      padding: "var(--space-md)",
                      backgroundColor: "var(--bg-tertiary)",
                    }}>
                      <pre style={{
                        margin: 0,
                        fontSize: "0.875rem",
                        overflow: "auto",
                        maxHeight: "300px",
                      }}>
                        {JSON.stringify(row, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div style={{
          padding: "var(--space-md)",
          textAlign: "center",
          borderTop: "1px solid var(--border-color)",
        }}>
          <button onClick={onLoadMore}>
            Load More Results
          </button>
        </div>
      )}
    </div>
  );
}
