import * as Types from "@/lib/search-types";

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

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "10px" }}>
      <h3>Results</h3>
      {/* Meta info */}
      <div data-testid="result-meta" style={{ marginBottom: "10px" }}>
        <strong>{rows} rows</strong>
        {rowsBeforeLimit > rows && ` (${rowsBeforeLimit} before limit)`}
        {statistics && (
          <span style={{ marginLeft: "20px", color: "#666" }}>
            {statistics.elapsed}s elapsed, 
            {statistics.rows_read} rows read, 
            {statistics.bytes_read} bytes
          </span>
        )}
        
        {/* Limit selector */}
        <select 
          value={limit} 
          onChange={e => onLimitChange(parseInt(e.target.value))}
          style={{ marginLeft: "20px" }}
        >
          <option value="10">10 rows</option>
          <option value="50">50 rows</option>
          <option value="100">100 rows</option>
          <option value="500">500 rows</option>
          <option value="1000">1000 rows</option>
        </select>
      </div>

      {/* Table */}
      <div data-testid="result-table" style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #ccc", padding: "5px" }}>Actions</th>
              {meta.map(col => {
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
                <td colSpan={meta.length + 1} style={{ textAlign: "center", padding: "20px" }}>
                  No results
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i}>
                  <td style={{ border: "1px solid #ccc", padding: "5px" }}>
                    <button onClick={() => copyRow(row)} style={{ fontSize: "12px" }}>
                      Copy
                    </button>
                  </td>
                  {meta.map(col => (
                    <td key={col.name} style={{ border: "1px solid #ccc", padding: "5px" }}>
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
    return new Date(value * 1000).toLocaleString();
  }
  
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  
  return String(value);
}
