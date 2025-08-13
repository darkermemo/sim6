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
    <div className="card" style={{ marginBottom: "var(--space-md)" }}>
      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
        {/* Tenant selector */}
        <select 
          className="input"
          aria-label="Tenant"
          value={tenantId} 
          onChange={e => onTenantChange(e.target.value)}
          style={{ width: "auto" }}
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

      {/* Time range */}
      <select
        aria-label="time range"
        value={'last_seconds' in time ? time.last_seconds : 'custom'}
        onChange={e => handleTimeRangeChange(e.target.value)}
        style={{ marginRight: "10px" }}
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

      {/* Query input */}
      <input
        type="text"
        aria-label="query"
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        placeholder="Enter search query..."
        style={{ width: "400px", marginRight: "10px" }}
      />

      {/* Action buttons */}
      <button onClick={onCompile} disabled={!!compiling} style={{ marginRight: "5px" }}>
        {compiling ? "Compiling…" : "Compile"}
      </button>
      <button onClick={onRun} disabled={!!running} style={{ marginRight: "5px" }}>
        {running ? "Running…" : "Run"}
      </button>
      
      <button 
        onClick={() => {
          const name = prompt("Save search as:");
          if (name) onSave(name);
        }}
        disabled={saving}
        style={{ marginRight: "5px" }}
      >
        {saving ? "Saving..." : "Save"}
      </button>

      {/* Export dropdown */}
      <div style={{ display: "inline-block", position: "relative" }}>
        <button 
          onClick={() => setShowExportMenu(!showExportMenu)}
          disabled={exporting}
        >
          {exporting ? "Exporting..." : "Export ▼"}
        </button>
        
        {showExportMenu && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            background: "white",
            border: "1px solid #ccc",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            zIndex: 1000,
          }}>
            <button 
              onClick={() => { onExport("csv"); setShowExportMenu(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 10px", border: "none" }}
            >
              CSV
            </button>
            <button 
              onClick={() => { onExport("ndjson"); setShowExportMenu(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 10px", border: "none" }}
            >
              NDJSON
            </button>
            <button 
              onClick={() => { onExport("parquet"); setShowExportMenu(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 10px", border: "none" }}
            >
              Parquet
            </button>
          </div>
        )}
      </div>

        <span style={{ marginLeft: "10px", fontSize: "12px", color: "#666" }}>
          Hotkeys: Enter = Run, Cmd/Ctrl+S = Save
        </span>
      </div>
    </div>
  );
}
