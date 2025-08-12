import React from "react";

export function SqlPreview({ sql }: { sql?: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4>SQL Preview</h4>
        <button onClick={() => sql && navigator.clipboard.writeText(sql)}>Copy</button>
      </div>
      <pre style={{ maxHeight: 200, overflow: "auto", background: "#111", color: "#ddd", padding: 8 }}>{sql || ""}</pre>
    </div>
  );
}

export default SqlPreview;


