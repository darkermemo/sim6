import * as Types from "@/lib/dashboard-types";

interface Props {
  ingest?: Types.IngestResp;
  query?: Types.QueryResp;
  storage?: Types.StorageResp;
  errors?: Types.ErrorsResp;
}

/**
 * KpiStrip - Shows key performance indicators
 * Displays ingest rate, query rate, storage used, error count
 */
export default function KpiStrip({ ingest, query, storage, errors }: Props) {
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatNumber = (num: number): string => {
    if (num < 1000) return String(num);
    if (num < 1000000) return `${(num / 1000).toFixed(1)}K`;
    return `${(num / 1000000).toFixed(1)}M`;
  };

  return (
    <div className="card" style={{ 
      display: "flex", 
      gap: "var(--space-lg)", 
      marginBottom: "var(--space-lg)"
    }}>
      {/* Ingest KPI */}
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Ingest Rate</div>
        <div data-testid="kpi-ingest-rows" style={{ fontSize: "24px", fontWeight: "bold" }}>
          {ingest ? formatNumber(ingest.totals.rows_in) : "—"}
        </div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          rows ({ingest ? formatBytes(ingest.totals.bytes_in) : "—"})
        </div>
      </div>

      {/* Query KPI */}
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Queries</div>
        <div style={{ fontSize: "24px", fontWeight: "bold" }}>
          {query ? formatNumber(query.totals.queries) : "—"}
        </div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          total queries
        </div>
      </div>

      {/* Storage KPI */}
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Storage Used</div>
        <div style={{ fontSize: "24px", fontWeight: "bold" }}>
          {storage ? formatBytes(storage.latest.storage_bytes) : "—"}
        </div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          total storage
        </div>
      </div>

      {/* Errors KPI */}
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Errors</div>
        <div style={{ fontSize: "24px", fontWeight: "bold", color: errors?.totals.errors ? "#c00" : "#000" }}>
          {errors ? formatNumber(errors.totals.errors) : "—"}
        </div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          total errors
        </div>
      </div>
    </div>
  );
}
