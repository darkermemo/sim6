import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/endpoints";
import { useDebouncedModel, type SearchModel, clampLimit, clampTimeRange } from "../hooks/useSearchModel";
import SearchQueryBar from "../components/search/SearchQueryBar";
import SqlPreview from "../components/search/SqlPreview";
import ResultsTable from "../components/search/ResultsTable";
import StatsStrip from "../components/search/StatsStrip";

export default function Search() {
  const { model, setModel, debounced } = useDebouncedModel();
  const [sql, setSql] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ name: string; type?: string }[] | undefined>();
  const [error, setError] = useState<string>("");
  const inflight = useRef<AbortController | null>(null);

  const body = useMemo(() => {
    const s: SearchModel = clampTimeRange({ ...debounced, limit: clampLimit(debounced.limit) });
    // Build unified DSL body
    const where = s.where
      ? s.where.op === "contains"
        ? { Contains: [s.where.args[0], s.where.args[1]] }
        : s.where.op === "json_eq"
          ? { JsonEq: [s.where.args[0], s.where.args[1]] }
          : { IpInCidr: [s.where.args[0], s.where.args[1]] }
      : undefined;
    return {
      search: {
        tenant_ids: s.tenant_ids,
        time_range: s.time_range,
        where,
        limit: s.limit,
        order_by: s.order_by,
      },
    } as any;
  }, [debounced]);

  const run = async () => {
    setError("");
    // Compile
    try {
      const res = await fetch("/api/v2/search/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setSql(j.sql || "");
    } catch (e: any) {
      setSql("");
      setError(String(e?.message || e));
      return;
    }
    // Execute (cancel any in-flight)
    if (inflight.current) inflight.current.abort();
    const ctl = new AbortController(); inflight.current = ctl;
    try {
      const res = await fetch("/api/v2/search/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      const data = j?.data?.data || j?.data || [];
      setRows(Array.isArray(data) ? data : []);
      setMeta(j?.data?.meta);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(String(e?.message || e));
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, []);

  return (
    <div style={{ display: "grid", gap: 12, padding: 12 }}>
      <h2>Search</h2>
      <SearchQueryBar value={model} onChange={setModel} onRun={run} />
      <SqlPreview sql={sql} />
      {error ? <div style={{ color: "#e33", whiteSpace: "pre-wrap" }}>{error}</div> : null}
      <ResultsTable rows={rows} meta={meta} />
      <StatsStrip />
    </div>
  );
}
// legacy content removed