import { useEffect, useMemo, useRef, useState } from "react";

export type Op = "contains" | "json_eq" | "ipincidr";

export interface SearchModel {
  tenant_ids: string[];
  time_range: { last_seconds?: number; start?: number; end?: number };
  where?: { op: Op; args: [string, string] };
  limit: number;
  order_by?: Array<{ field: string; dir: "asc" | "desc" }>;
}

export function clampLimit(limit: number): number {
  return Math.max(1, Math.min(1000, limit));
}

export function clampTimeRange(m: SearchModel): SearchModel {
  const maxSpan = 24 * 3600; // 24h seconds
  if (m.time_range.last_seconds) {
    return { ...m, time_range: { last_seconds: Math.min(m.time_range.last_seconds, maxSpan) } };
  }
  if (m.time_range.start && m.time_range.end) {
    const span = Math.abs(m.time_range.end - m.time_range.start);
    if (span > maxSpan) {
      return { ...m, time_range: { last_seconds: maxSpan } };
    }
  }
  return m;
}

export function useDebouncedModel(initial?: Partial<SearchModel>) {
  const [model, setModel] = useState<SearchModel>({
    tenant_ids: ["default"],
    time_range: { last_seconds: 600 },
    limit: 200,
    ...(initial || {}),
  } as SearchModel);
  const [debounced, setDebounced] = useState(model);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDebounced(prev => {
      const clamped = { ...model, limit: clampLimit(model.limit) };
      return clampTimeRange(clamped);
    }), 350);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [model]);

  return { model, setModel, debounced };
}


