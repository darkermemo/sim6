import React from "react";
import type { SearchModel } from "../../hooks/useSearchModel";

type Props = {
  value: SearchModel;
  onChange: (m: SearchModel) => void;
  onRun: () => void;
};

const FIELDS = [
  "message",
  "source_ip",
  "destination_ip",
  "event_type",
  "host",
  "user",
];

export function QueryBar({ value, onChange, onRun }: Props) {
  const set = (patch: Partial<SearchModel>) => onChange({ ...value, ...patch });
  const setWhere = (field: string, op: any, arg: string) =>
    set({ where: { op: op || "contains", args: [field, arg] } as any });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "center" }}>
      <input placeholder="tenant" value={value.tenant_ids[0]}
        onChange={e => set({ tenant_ids: [e.target.value] })} />
      <select value={value.where?.args[0] || "message"} onChange={e => setWhere(e.target.value, value.where?.op || "contains", value.where?.args[1] || "") }>
        {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <select value={value.where?.op || "contains"} onChange={e => setWhere(value.where?.args[0] || "message", e.target.value as any, value.where?.args[1] || "") }>
        <option value="contains">contains</option>
        <option value="json_eq">json_eq</option>
        <option value="ipincidr">ipincidr</option>
      </select>
      <input placeholder="value" value={value.where?.args[1] || ""}
        onChange={e => setWhere(value.where?.args[0] || "message", value.where?.op || "contains", e.target.value)} />
      <input type="number" min={1} max={1000} value={value.limit} onChange={e => set({ limit: Math.max(1, Math.min(1000, Number(e.target.value)||200)) })} />
      <button onClick={onRun}>Run</button>
      <div style={{ gridColumn: "1 / span 2" }}>
        <label htmlFor="qb-last-seconds">Last seconds</label>
        <input id="qb-last-seconds" type="number" min={1} max={86400} value={value.time_range.last_seconds || 600}
          onChange={e => set({ time_range: { last_seconds: Math.max(1, Math.min(86400, Number(e.target.value)||600)) } })} />
      </div>
    </div>
  );
}

export default QueryBar;

