import * as Types from "@/lib/search-types";
import { useMemo, useState } from "react";
import ColumnSelector from "@/components/ColumnSelector";
import CompactSelect from "@/components/ui/CompactSelect";
import ExcelTable from "@/components/ExcelTable";

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
  const [showColumnPicker, setShowColumnPicker] = useState(false);

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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "10px" }}>
      <h3 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: 600 }}>Results</h3>
      {/* Compact Controls Row */}
      <div data-testid="result-meta" style={{ 
        marginBottom: "6px", 
        display: "flex", 
        gap: "8px", 
        alignItems: "center", 
        fontSize: "10px",
        padding: "4px 6px",
        backgroundColor: "#f8fafc",
        borderRadius: "3px",
        border: "1px solid #e2e8f0"
      }}>
        {/* Result count - prominent */}
        <div style={{ 
          fontSize: "11px", 
          fontWeight: 600, 
          color: "#374151",
          marginRight: "auto"
        }}>
          {rows} rows
          {rowsBeforeLimit > rows && ` (${rowsBeforeLimit} total)`}
          {statistics && (
            <span style={{ marginLeft: "8px", color: "#64748b", fontSize: "9px", fontWeight: 400 }}>
              {statistics.elapsed}s • {statistics.rows_read} rows • {statistics.bytes_read} bytes
            </span>
          )}
        </div>

        {/* Compact controls */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {/* Limit selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 600 }}>Limit:</span>
            <CompactSelect
              value={limit}
              onChange={(value) => onLimitChange(parseInt(value.toString()))}
              size="xs"
              aria-label="Row limit"
              options={[
                { value: 10, label: "10" },
                { value: 50, label: "50" },
                { value: 100, label: "100" },
                { value: 500, label: "500" },
                { value: 1000, label: "1000" },
              ]}
            />
          </div>

          {/* Hide empty checkbox */}
          <label style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "3px", 
            cursor: "pointer",
            fontSize: "9px",
            color: "#64748b"
          }}>
            <input 
              type="checkbox" 
              checked={hideEmpty} 
              onChange={e => setHideEmpty(e.target.checked)}
              style={{ 
                width: "12px", 
                height: "12px",
                cursor: "pointer"
              }}
            />
            Hide empty
          </label>

          {/* Modern Column Selector */}
          <ColumnSelector
            columns={meta.map(m => ({ name: m.name, type: m.type }))}
            selectedColumns={visibleColumns}
            onChange={setVisibleColumns}
            defaultColumns={defaultCompact}
          />
        </div>
      </div>

      {/* Excel-like Table */}
      <div data-testid="result-table" style={{ flex: 1 }}>
        <ExcelTable
          data={data}
          columns={columnsToRender}
          onSort={handleSort}
          sortField={sort.length > 0 ? sort[0].field : undefined}
          sortDirection={sort.length > 0 ? sort[0].dir : undefined}
          height={600}
        />
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
