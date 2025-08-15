import React, { useEffect, useState } from "react";
import { apiFetch } from '@/lib/api';

function pick(line: string, metric: string) {
  const m = line.match(new RegExp(`^${metric}\\b.* (\\d+(?:\\.\\d+)?)$`));
  return m ? m[1] : null;
}

export function StatsStrip() {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    fetch('/metrics')
      .then(res => res.text())
      .then(setText)
      .catch(() => setText(""));
  }, []);
  if (!text) return null;
  const lines = text.split("\n");
  const ingest = lines.map(l => pick(l, "siem_v2_ingest_total")).find(Boolean);
  const rateLimited = lines.map(l => pick(l, "siem_v2_rate_limit_total")).find(Boolean);
  return (
    <div style={{ fontSize: 12, opacity: 0.85, display: "flex", gap: 16, padding: 4 }}>
      <span>ingest_total: {ingest ?? "n/a"}</span>
      <span>rate_limit_total: {rateLimited ?? "n/a"}</span>
    </div>
  );
}

export default StatsStrip;


