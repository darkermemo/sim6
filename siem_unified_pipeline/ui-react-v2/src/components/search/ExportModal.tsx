import { useState } from "react";
import * as Types from "@/lib/api-types";

interface Props {
  onExport: (format: Types.ExportFormat, maxRows: number) => void;
  onClose: () => void;
  estimatedRows: number;
}

/**
 * Export modal for downloading search results
 */
export default function ExportModal({ onExport, onClose, estimatedRows }: Props) {
  const [format, setFormat] = useState<Types.ExportFormat>("csv");
  const [maxRows, setMaxRows] = useState(10000);
  
  const formats: { value: Types.ExportFormat; label: string; description: string }[] = [
    { 
      value: "csv", 
      label: "CSV", 
      description: "Comma-separated values, compatible with Excel" 
    },
    { 
      value: "ndjson", 
      label: "NDJSON", 
      description: "Newline-delimited JSON, one event per line" 
    },
    { 
      value: "parquet", 
      label: "Parquet", 
      description: "Columnar format for big data processing" 
    },
  ];

  const handleExport = () => {
    onExport(format, maxRows);
    onClose();
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-xl)",
        minWidth: "400px",
        maxWidth: "500px",
        boxShadow: "var(--shadow-lg)",
      }}>
        <h3 style={{ marginBottom: "var(--space-lg)" }}>Export Search Results</h3>
        
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <label style={{ 
            display: "block", 
            marginBottom: "var(--space-sm)",
            fontWeight: 500,
            fontSize: "0.875rem"
          }}>
            Format
          </label>
          {formats.map(fmt => (
            <label
              key={fmt.value}
              style={{
                display: "block",
                padding: "var(--space-sm)",
                marginBottom: "var(--space-xs)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                backgroundColor: format === fmt.value ? "var(--bg-secondary)" : "transparent",
                transition: "all 0.2s",
              }}
            >
              <input
                type="radio"
                name="format"
                value={fmt.value}
                checked={format === fmt.value}
                onChange={(e) => setFormat(e.target.value as Types.ExportFormat)}
                style={{ marginRight: "var(--space-sm)" }}
              />
              <strong>{fmt.label}</strong>
              <div style={{ 
                marginLeft: "1.5rem",
                fontSize: "0.875rem",
                color: "var(--text-secondary)"
              }}>
                {fmt.description}
              </div>
            </label>
          ))}
        </div>

        <div style={{ marginBottom: "var(--space-lg)" }}>
          <label style={{ 
            display: "block", 
            marginBottom: "var(--space-sm)",
            fontWeight: 500,
            fontSize: "0.875rem"
          }}>
            Maximum Rows
          </label>
          <input
            type="number"
            value={maxRows}
            onChange={(e) => setMaxRows(Math.max(1, Math.min(1000000, parseInt(e.target.value) || 0)))}
            min={1}
            max={1000000}
            style={{ width: "100%" }}
          />
          <div style={{ 
            marginTop: "var(--space-xs)",
            fontSize: "0.75rem",
            color: "var(--text-tertiary)"
          }}>
            Estimated {estimatedRows.toLocaleString()} total events available
          </div>
        </div>

        <div style={{ 
          display: "flex", 
          gap: "var(--space-md)",
          justifyContent: "flex-end" 
        }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
            }}
          >
            Cancel
          </button>
          <button onClick={handleExport}>
            Export {format.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
