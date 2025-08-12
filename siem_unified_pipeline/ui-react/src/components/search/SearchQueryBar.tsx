import React from "react";
import type { SearchModel } from "../../hooks/useSearchModel";

type Props = { value: SearchModel; onChange: (m: SearchModel) => void; onRun: () => void };

const FIELDS = ["message", "source_ip", "destination_ip", "event_type", "host", "user"];

export default function SearchQueryBar({ value, onChange, onRun }: Props) {
  const set = (patch: Partial<SearchModel>) => onChange({ ...value, ...patch });
  const setWhere = (field: string, op: any, arg: string) => set({ where: { op: op || "contains", args: [field, arg] } as any });
  const tenantId = value.tenant_ids?.[0] ?? "default";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "center" }}>
      <input aria-label="tenant" placeholder="tenant" value={tenantId} onChange={e => set({ tenant_ids: [e.target.value] })} />
      <select aria-label="field" value={value.where?.args[0] || "message"} onChange={e => setWhere(e.target.value, value.where?.op || "contains", value.where?.args[1] || "") }>
        {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <select aria-label="op" value={value.where?.op || "contains"} onChange={e => setWhere(value.where?.args[0] || "message", e.target.value as any, value.where?.args[1] || "") }>
        <option value="contains">contains</option>
        <option value="json_eq">json_eq</option>
        <option value="ipincidr">ipincidr</option>
      </select>
      <input aria-label="value" placeholder="value" value={value.where?.args[1] || ""} onChange={e => setWhere(value.where?.args[0] || "message", value.where?.op || "contains", e.target.value)} />
      <input aria-label="limit" type="number" min={1} max={1000} value={value.limit} onChange={e => set({ limit: Math.max(1, Math.min(1000, Number(e.target.value)||200)) })} />
      <button onClick={onRun}>Run</button>
      <div style={{ gridColumn: "1 / span 2" }}>
        <label htmlFor="last-seconds">Last seconds</label>
        <input id="last-seconds" type="number" min={1} max={86400} value={value.time_range.last_seconds || 600}
          onChange={e => set({ time_range: { last_seconds: Math.max(1, Math.min(86400, Number(e.target.value)||600)) } })} />
      </div>
    </div>
  );
}


