import { useEffect } from "react";
import * as Types from "@/lib/search-types";
import CompactSelect from "@/components/ui/CompactSelect";

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
  onExport: () => void;
  saving?: boolean;
  exporting?: boolean;
  compiling?: boolean;
  running?: boolean;
}

/**
 * QueryBar - Ultra-compact search controls in a single row
 * Contains tenant, time range, query input, and essential actions
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
  
  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
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
      backgroundColor: "var(--muted)",
      borderBottom: "1px solid var(--border)",
      padding: "4px 8px",
      flexShrink: 0
    }}>
      {/* Compact single-row controls */}
      <div style={{ 
        display: "flex", 
        gap: "6px", 
        alignItems: "center",
        fontSize: "11px"
      }}>
        {/* Compact Tenant selector */}
        <span style={{ fontSize: "9px", color: "var(--fg-muted)", fontWeight: "600" }}>Tenant:</span>
        <CompactSelect
          value={tenantId}
          onChange={(value) => onTenantChange(value.toString())}
          size="xs"
          aria-label="Tenant"
          options={[
            { value: "all", label: "All" },
            { value: "default", label: "default" },
            { value: "1", label: "1" },
            { value: "hr", label: "hr" },
            { value: "finance", label: "finance" },
            { value: "engineering", label: "engineering" },
            { value: "sales", label: "sales" },
            { value: "marketing", label: "marketing" },
            { value: "ops", label: "ops" },
            { value: "security", label: "security" },
            { value: "admin", label: "admin" },
          ]}
        />

        {/* Compact Time range */}
        <span style={{ fontSize: "9px", color: "var(--fg-muted)", fontWeight: "600", marginLeft: "8px" }}>Time:</span>
        <CompactSelect
          value={'last_seconds' in time ? time.last_seconds?.toString() ?? 'custom' : 'custom'}
          onChange={(value) => handleTimeRangeChange(value.toString())}
          size="xs"
          aria-label="time range"
          options={[
            { value: "300", label: "5m" },
            { value: "600", label: "10m" },
            { value: "3600", label: "1h" },
            { value: "86400", label: "24h" },
            { value: "604800", label: "7d" },
            { value: "2592000", label: "30d" },
            { value: "custom", label: "Custom" },
          ]}
        />

        {/* Compact Query input */}
        <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "600", marginLeft: "8px" }}>Query:</span>
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
          placeholder="Search terms..."
          style={{ 
            flex: 1,
            padding: "2px 6px",
            border: "1px solid #d1d5db",
            borderRadius: "2px",
            fontSize: "10px",
            backgroundColor: "#ffffff",
            fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
            minWidth: "200px"
          }}
        />

        {/* Compact action buttons */}
        <button 
          onClick={onCompile} 
          disabled={!!compiling}
          style={{
            backgroundColor: compiling ? "#e5e7eb" : "#3b82f6",
            color: compiling ? "#9ca3af" : "white",
            border: "none",
            padding: "2px 6px",
            borderRadius: "2px",
            fontSize: "9px",
            fontWeight: 500,
            cursor: compiling ? "not-allowed" : "pointer"
          }}
        >
          {compiling ? "..." : "Compile"}
        </button>

        <button 
          onClick={onRun} 
          disabled={!!running}
          style={{
            backgroundColor: running ? "#e5e7eb" : "#10b981",
            color: running ? "#9ca3af" : "white",
            border: "none",
            padding: "2px 6px",
            borderRadius: "2px",
            fontSize: "9px",
            fontWeight: 500,
            cursor: running ? "not-allowed" : "pointer"
          }}
        >
          {running ? "..." : "Run"}
        </button>

        {/* Essential actions - inline */}
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
            padding: "2px 4px",
            borderRadius: "2px",
            fontSize: "9px",
            cursor: saving ? "not-allowed" : "pointer",
            marginLeft: "8px"
          }}
        >
          Save
        </button>

        <button 
          onClick={onExport}
          disabled={exporting}
          style={{
            backgroundColor: exporting ? "#f3f4f6" : "#ffffff",
            color: exporting ? "#9ca3af" : "#374151",
            border: "1px solid #d1d5db",
            padding: "2px 4px",
            borderRadius: "2px",
            fontSize: "9px",
            cursor: exporting ? "not-allowed" : "pointer"
          }}
        >
          Export
        </button>
      </div>
    </div>
  );
}