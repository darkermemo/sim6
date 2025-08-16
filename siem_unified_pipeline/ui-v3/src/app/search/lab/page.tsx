"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { ResultTable } from '@/components/search/ResultTable';
import { FacetPanel } from '@/components/search/FacetPanel';
import { TimelineHook } from '@/components/search/TimelineHook';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { execute, fetchFacets } from '@/lib/searchui-connector';
import { searchAggs } from '@/lib/api';

export default function SearchLabPage() {
  const [q, setQ] = useState('');
  const [tenantId, setTenantId] = useState('default');
  const [lastSeconds, setLastSeconds] = useState(172800);
  const [page, setPage] = useState(1);
  const [size] = useState(100);
  const [events, setEvents] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any>(null);
  const [facets, setFacets] = useState<any>(null);
  const [selectedFacets, setSelectedFacets] = useState<Record<string, string[]>>({});
  const [total, setTotal] = useState<number>(0);

  const builtQuery = useMemo(() => {
    let finalQ = q || '';
    Object.entries(selectedFacets).forEach(([field, values]) => {
      values.forEach((v) => {
        finalQ += ` ${field}:${v}`;
      });
    });
    return finalQ.trim();
  }, [q, selectedFacets]);

  const load = async () => {
    const data = await execute({ q: builtQuery, tenant_id: tenantId, last_seconds: lastSeconds, page, size });
    setEvents(data?.data?.meta || []);
    setTotal(typeof data?.data?.rows === 'number' ? data.data.rows : (data?.data?.meta?.length || 0));
  };

  useEffect(() => {
    load();
  }, [q, tenantId, lastSeconds, page]);

  useEffect(() => {
    (async () => {
      const f = await fetchFacets(builtQuery, tenantId, lastSeconds, [
        { field: 'severity', size: 8 },
        { field: 'source_type', size: 10 },
      ]);
      setFacets(f);
    })();
  }, [builtQuery, tenantId, lastSeconds]);

  // timeline
  useEffect(() => {
    (async () => {
      const t = await searchAggs(builtQuery, tenantId, lastSeconds);
      setTimeline(t);
    })();
  }, [builtQuery, tenantId, lastSeconds]);

  const handleFacetSelect = (field: string, value: string) => {
    setSelectedFacets((prev) => ({
      ...prev,
      [field]: [...(prev[field] || []), value],
    }));
    setPage(1);
  };

  const handleFacetRemove = (field: string, value: string) => {
    setSelectedFacets((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((v) => v !== value),
    }));
    setPage(1);
  };

  return (
    <div className="p-4 grid grid-cols-[280px_1fr] gap-4">
      <div>
        <FacetPanel
          query={builtQuery}
          tenantId={tenantId}
          timeRange={lastSeconds}
          onFacetSelect={handleFacetSelect}
          onFacetRemove={handleFacetRemove}
          selectedFacets={selectedFacets}
          facetsData={facets}
        />
      </div>
      <div className="space-y-4 min-w-0">
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
          <Button onClick={() => load()}>Run</Button>
        </div>
        <TimelineHook timelineData={timeline} loading={false} onTimeWindowChange={() => {}} bare />
        <ResultTable events={events} loading={false} onRowClick={() => {}} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {events.length} of {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}


