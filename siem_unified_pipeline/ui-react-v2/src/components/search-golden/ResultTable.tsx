import * as Types from "@/lib/search-types";
import { useMemo, useState } from "react";

interface Props {
  data: any[];
  meta: Array<{ name: string; type: string }>;
  rows: number;
  rowsBeforeLimit: number;
  statistics: any;
  sort: Types.SortSpec[];
  onSort: (sort: Types.SortSpec[]) => void;
  limit: number;
  onLimitChange: (limit: number) => void;
}

/**
 * ResultTable - Renders search results
 * Features: sorting, column selection, pagination, row copy
 */
export default function ResultTable({
  data,
  meta,
  rows,
  rowsBeforeLimit,
  statistics,
  sort,
  onSort,
  limit,
  onLimitChange,
}: Props) {
  const handleSort = (field: string) => {
    const currentSort = sort.find(s => s.field === field);
    const newDir = currentSort?.dir === "asc" ? "desc" : "asc";
    onSort([{ field, dir: newDir }]);
  };

  const copyRow = (row: any) => {
    navigator.clipboard.writeText(JSON.stringify(row, null, 2));
  };

  // UX controls: compact view, hide-empty, column picker
  const defaultCompact = useMemo(() => [
    "event_timestamp",
    "created_at",
    "severity",
    "event_type",
    "message",
    "source_type",
    "source_ip",
    "destination_ip",
    "user",
    "host",
  ], []);

  const allColumnNames = useMemo(() => meta.map(m => m.name), [meta]);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    allColumnNames.filter(n => defaultCompact.includes(n))
  );
  const [hideEmpty, setHideEmpty] = useState<boolean>(true);

  const isEmptyValue = (v: any) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && Object.keys(v).length === 0);

  const nonEmptyByColumn = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const m of meta) {
      map[m.name] = data.some(row => !isEmptyValue(row[m.name]));
    }
    return map;
  }, [data, meta]);

  const columnsToRender = useMemo(() => {
    const base = (visibleColumns.length ? visibleColumns : allColumnNames);
    return meta.filter(m => base.includes(m.name)).filter(m => (hideEmpty ? nonEmptyByColumn[m.name] : true));
  }, [meta, visibleColumns, hideEmpty, nonEmptyByColumn, allColumnNames]);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "10px" }}>
      <h3>Results</h3>
      {/* Meta info */}
      <div data-testid="result-meta" style={{ marginBottom: "10px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong>{rows} rows</strong>
        {rowsBeforeLimit > rows && ` (${rowsBeforeLimit} before limit)`}
        {statistics && (
          <span style={{ marginLeft: "8px", color: "#666" }}>
            {statistics.elapsed}s elapsed, {statistics.rows_read} rows read, {statistics.bytes_read} bytes
          </span>
        )}

        {/* Limit selector */}
        <label style={{ marginLeft: "auto", fontSize: 12 }}>
          Rows:
          <select
            value={limit}
            onChange={e => onLimitChange(parseInt(e.target.value))}
            style={{ marginLeft: 6 }}
          >
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
          </select>
        </label>

        {/* Hide empty */}
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} /> Hide empty columns
        </label>

        {/* Quick presets */}
        <button onClick={() => setVisibleColumns(allColumnNames.filter(n => defaultCompact.includes(n)))} style={{ fontSize: 12 }}>
          Compact
        </button>
        <button onClick={() => setVisibleColumns(allColumnNames)} style={{ fontSize: 12 }}>
          All fields
        </button>

        {/* Column picker */}
        <label style={{ fontSize: 12 }}>
          Columns:
          <select multiple value={visibleColumns} onChange={e => {
            const options = Array.from(e.target.selectedOptions).map(o => o.value);
            setVisibleColumns(options);
          }} style={{ marginLeft: 6, minWidth: 200, maxHeight: 80 }}>
            {allColumnNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Table */}
      <div data-testid="result-table" style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: "5px", position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>Actions</th>
              {columnsToRender.map(col => {
                const currentSort = sort.find(s => s.field === col.name);
                return (
                  <th
                    key={col.name}
                    onClick={() => handleSort(col.name)}
                    style={{
                      border: "1px solid #ccc",
                      padding: "5px",
                      cursor: "pointer",
                      backgroundColor: currentSort ? "#f0f0f0" : "white",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.name}
                    {currentSort && (
                      <span> {currentSort.dir === "asc" ? "↑" : "↓"}</span>
                    )}
                    <div style={{ fontSize: "10px", color: "#666" }}>{col.type}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columnsToRender.length + 1} style={{ textAlign: "center", padding: "20px" }}>
                  No results
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid #ccc", padding: "5px", position: "sticky", left: 0, background: "#fff" }}>
                    <button onClick={() => copyRow(row)} style={{ fontSize: "12px" }}>
                      Copy
                    </button>
                  </td>
                  {columnsToRender.map(col => (
                    <td key={col.name} style={{ border: "1px solid #ccc", padding: "5px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {formatValue(row[col.name], col.type)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatValue(value: any, type: string): string {
  if (value === null || value === undefined) return "";

  if (type.includes("DateTime")) {
    const toMs = (v: any): number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number") {
        // Detect seconds vs milliseconds
        if (v > 1e12) return v; // already ms
        if (v > 1e9) return Math.round(v * 1000); // seconds -> ms
        // Fallback assume ms
        return v;
      }
      if (typeof v === "string") {
        // Numeric string (possibly with fractions)
        if (/^\d+(\.\d+)?$/.test(v)) {
          const num = parseFloat(v);
          return num > 1e12 ? num : Math.round(num * 1000);
        }
        // Try ISO or "YYYY-MM-DD HH:MM:SS.mmm" -> make ISO
        const isoLike = v.includes("T") ? v : v.replace(" ", "T");
        const d1 = new Date(isoLike);
        if (!isNaN(d1.getTime())) return d1.getTime();
        // Try appending Z to treat as UTC
        const d2 = new Date(isoLike + "Z");
        if (!isNaN(d2.getTime())) return d2.getTime();
        return null;
      }
      return null;
    };

    const ms = toMs(value);
    if (ms === null) return "";
    return new Date(ms).toLocaleString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}
