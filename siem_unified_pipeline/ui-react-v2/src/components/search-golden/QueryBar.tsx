import { useState, useEffect } from "react";
import * as Types from "@/lib/search-types";

interface Props {
  tenantId: string;
  query: string;
  time: Types.TimeRange;
  onTenantChange: (tenant: string) => void;
  onQueryChange: (query: string) => void;
  onTimeChange: (time: Types.TimeRange) => void;
  onCompile: () => void;
  onRun: () => void;
  onSave: (name: string) => void;
  onExport: (format: Types.ExportFormat) => void;
  saving: boolean;
  exporting: boolean;
  compiling?: boolean;
  running?: boolean;
}

/**
 * QueryBar - Input controls for search
 * Handles tenant, query, time range, and action buttons
 * Hotkeys: Enter = Run, Cmd/Ctrl+S = Save
 */
export default function QueryBar({
  tenantId,
  query,
  time,
  onTenantChange,
  onQueryChange,
  onTimeChange,
  onCompile,
  onRun,
  onSave,
  onExport,
  saving,
  exporting,
  compiling,
  running,
}: Props) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Handle hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
        e.preventDefault();
        onRun();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onCompile();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const name = prompt("Save search as:");
        if (name) onSave(name);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRun, onSave]);

  const handleTimeRangeChange = (value: string) => {
    if (value === "custom") {
      // Use more user-friendly date inputs
      const fromDate = prompt("From date (YYYY-MM-DD HH:MM):");
      const toDate = prompt("To date (YYYY-MM-DD HH:MM):");
      if (fromDate && toDate) {
        try {
          const fromTimestamp = Math.floor(new Date(fromDate).getTime() / 1000);
          const toTimestamp = Math.floor(new Date(toDate).getTime() / 1000);
          if (!isNaN(fromTimestamp) && !isNaN(toTimestamp)) {
            onTimeChange({ from: fromTimestamp, to: toTimestamp });
          } else {
            alert("Invalid date format. Please use YYYY-MM-DD HH:MM format.");
          }
        } catch (err) {
          alert("Invalid date format. Please use YYYY-MM-DD HH:MM format.");
        }
      }
    } else {
      onTimeChange({ last_seconds: parseInt(value) });
    }
  };

  return (
    <div style={{ 
      backgroundColor: "#ffffff",
      borderBottom: "1px solid #e2e8f0",
      padding: "16px 24px",
      flexShrink: 0
    }}>
      {/* Primary search controls */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "200px 180px 1fr 120px 100px", 
        gap: "12px", 
        alignItems: "end",
        marginBottom: "12px"
      }}>
        {/* Tenant selector */}
        <div>
          <label style={{ 
            display: "block", 
            fontSize: "12px", 
            fontWeight: 500, 
            color: "#64748b", 
            marginBottom: "4px" 
          }}>
            Tenant
          </label>
          <select 
            aria-label="Tenant"
            value={tenantId} 
            onChange={e => onTenantChange(e.target.value)}
            style={{ 
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              backgroundColor: "#ffffff",
              minWidth: "120px"
            }}
          >
        <option value="all">All tenants</option>
        <option value="default">default</option>
        <option value="1">1</option>
        <option value="hr">hr</option>
        <option value="finance">finance</option>
        <option value="engineering">engineering</option>
        <option value="sales">sales</option>
        <option value="marketing">marketing</option>
        <option value="ops">ops</option>
        <option value="security">security</option>
        <option value="admin">admin</option>
          </select>
        </div>

        {/* Time range */}
        <div>
          <label style={{ 
            display: "block", 
            fontSize: "12px", 
            fontWeight: 500, 
            color: "#64748b", 
            marginBottom: "4px" 
          }}>
            Time Range
          </label>
          <select
            aria-label="time range"
            value={'last_seconds' in time ? time.last_seconds : 'custom'}
            onChange={e => handleTimeRangeChange(e.target.value)}
            style={{ 
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              backgroundColor: "#ffffff",
              minWidth: "140px"
            }}
          >
        <option value="300">Last 5 minutes</option>
        <option value="600">Last 10 minutes</option>
        <option value="3600">Last 1 hour</option>
        <option value="86400">Last 24 hours</option>
        <option value="604800">Last 7 days</option>
        <option value="2592000">Last 30 days</option>
        <option value="7776000">Last 90 days</option>
        <option value="10368000">Last 120 days</option>
        <option value="21600000">Last 250 days</option>
        <option value="31536000">Last 365 days</option>
        <option value="315360000">Last 10 years (test data)</option>
        <option value="custom">Custom range...</option>
                </select>
        </div>

        {/* Query input - takes remaining space */}
        <div>
          <label style={{ 
            display: "block", 
            fontSize: "12px", 
            fontWeight: 500, 
            color: "#64748b", 
            marginBottom: "4px" 
          }}>
            Search Query
          </label>
          <input
            type="text"
            aria-label="query"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (e.metaKey || e.ctrlKey) {
                  onCompile();
                } else {
                  onRun();
                }
              }
            }}
            placeholder="Enter search terms or leave empty for all events..."
            style={{ 
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "14px",
              backgroundColor: "#ffffff",
              fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace"
            }}
          />
        </div>

        {/* Compile button */}
        <button 
          onClick={onCompile} 
          disabled={!!compiling}
          style={{
            backgroundColor: compiling ? "#e5e7eb" : "#3b82f6",
            color: compiling ? "#9ca3af" : "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: compiling ? "not-allowed" : "pointer",
            transition: "all 0.2s"
          }}
        >
          {compiling ? "Compiling…" : "Compile"}
        </button>

        {/* Run button */}
        <button 
          onClick={onRun} 
          disabled={!!running}
          style={{
            backgroundColor: running ? "#e5e7eb" : "#10b981",
            color: running ? "#9ca3af" : "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: running ? "not-allowed" : "pointer",
            transition: "all 0.2s"
          }}
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>

      {/* Secondary actions bar */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "12px",
        borderTop: "1px solid #f1f5f9"
      }}>
        {/* Left side - Search stats */}
        <div style={{ 
          display: "flex", 
          gap: "16px", 
          alignItems: "center",
          fontSize: "13px",
          color: "#64748b"
        }}>
          <span>
            💡 Hotkeys: <kbd style={{ 
              padding: "2px 6px", 
              backgroundColor: "#f1f5f9", 
              borderRadius: "3px",
              fontSize: "11px",
              fontFamily: "ui-monospace, monospace"
            }}>Enter</kbd> = Run, <kbd style={{ 
              padding: "2px 6px", 
              backgroundColor: "#f1f5f9", 
              borderRadius: "3px",
              fontSize: "11px",
              fontFamily: "ui-monospace, monospace"
            }}>Cmd+Enter</kbd> = Compile
          </span>
        </div>

        {/* Right side - Actions */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button 
            onClick={() => {
              const name = prompt("Save search as:");
              if (name) onSave(name);
            }}
            disabled={saving}
            style={{
              backgroundColor: saving ? "#f3f4f6" : "#ffffff",
              color: saving ? "#9ca3af" : "#374151",
              border: "1px solid #d1d5db",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            {saving ? "Saving..." : "💾 Save"}
          </button>

          {/* Export dropdown */}
          <div style={{ position: "relative" }}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              style={{
                backgroundColor: exporting ? "#f3f4f6" : "#ffffff",
                color: exporting ? "#9ca3af" : "#374151",
                border: "1px solid #d1d5db",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: exporting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              {exporting ? "Exporting..." : "📤 Export ▼"}
            </button>
            
            {showExportMenu && (
              <div style={{
                position: "absolute",
                top: "100%",
                right: 0,
                background: "white",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                padding: "4px 0",
                minWidth: "120px",
                zIndex: 1000,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)"
              }}>
                <button 
                  onClick={() => { onExport("csv"); setShowExportMenu(false); }}
                  style={{ 
                    display: "block", 
                    width: "100%", 
                    textAlign: "left", 
                    padding: "8px 12px", 
                    border: "none",
                    backgroundColor: "transparent",
                    fontSize: "12px",
                    cursor: "pointer"
                  }}
                >
                  📄 CSV
                </button>
                <button 
                  onClick={() => { onExport("ndjson"); setShowExportMenu(false); }}
                  style={{ 
                    display: "block", 
                    width: "100%", 
                    textAlign: "left", 
                    padding: "8px 12px", 
                    border: "none",
                    backgroundColor: "transparent",
                    fontSize: "12px",
                    cursor: "pointer"
                  }}
                >
                  🔧 NDJSON
                </button>
                <button 
                  onClick={() => { onExport("parquet"); setShowExportMenu(false); }}
                  style={{ 
                    display: "block", 
                    width: "100%", 
                    textAlign: "left", 
                    padding: "8px 12px", 
                    border: "none",
                    backgroundColor: "transparent",
                    fontSize: "12px",
                    cursor: "pointer"
                  }}
                >
                  📦 Parquet
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
