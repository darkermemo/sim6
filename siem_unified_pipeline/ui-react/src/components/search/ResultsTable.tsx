import React, { useMemo } from "react";

type Props = { rows: any[]; meta?: { name: string; type?: string }[] };

export function ResultsTable({ rows, meta }: Props) {
  const columns = useMemo(() => {
    if (meta && meta.length) return meta.map(m => m.name);
    if (rows && rows.length) return Object.keys(rows[0]);
    return [] as string[];
  }, [rows, meta]);

  const exportCsv = () => {
    const header = columns.join(",");
    const body = rows.map(r => columns.map(c => JSON.stringify(r[c] ?? "")).join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "search.csv";
    a.click();
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(rows)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "search.json";
    a.click();
  };

  if (!rows || rows.length === 0) {
    return <div style={{ padding: 8 }}>No results. Try widening time range or adjusting query.</div>;
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={exportCsv}>Export CSV</button>
        <button onClick={exportJson}>Export JSON</button>
      </div>
      <div style={{ maxHeight: 480, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: "#222", color: "#eee" }}>
            <tr>
              {columns.map(c => (
                <th key={c} style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #333" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c} style={{ padding: 6, borderBottom: "1px solid #333" }}>{
                    typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")
                  }</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ResultsTable;


