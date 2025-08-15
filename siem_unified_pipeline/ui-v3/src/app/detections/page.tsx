"use client";

import React, { useEffect, useState } from "react";
import { DetectionsAPI } from "@/lib/detections";
import type { DetectionRecord } from "@/types/detections";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DetectionsListPage() {
  const [items, setItems] = useState<DetectionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const res = await DetectionsAPI.list();
      setItems(res.items);
    } catch (e:any) { setErr(String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const runOnce = async (id: string) => {
    await DetectionsAPI.runOnce(id); load();
  };

  const toggleEnable = async (it: DetectionRecord) => {
    await DetectionsAPI.update(it.id, { ...it, enabled: !it.enabled }); load();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Detections</h1>
        <Button asChild><Link href="/ui/v3/detections/new">New Detection</Link></Button>
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="overflow-auto rounded border">
        <table className="min-w-full text-sm">
          <thead><tr className="bg-muted">
            <th className="text-left p-2">Name</th>
            <th className="text-left p-2">Severity</th>
            <th className="text-left p-2">Owner</th>
            <th className="text-left p-2">Enabled</th>
            <th className="text-left p-2">Updated</th>
            <th className="text-right p-2">Actions</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td className="p-4" colSpan={6}>Loading…</td></tr>}
            {!loading && items.map(it => (
              <tr key={it.id} className="border-t">
                <td className="p-2"><Link href={`/ui/v3/detections/${it.id}`} className="underline">{it.name}</Link></td>
                <td className="p-2">{it.severity}</td>
                <td className="p-2">{it.owner}</td>
                <td className="p-2">{it.enabled ? 'Yes' : 'No'}</td>
                <td className="p-2">{it.updated_at}</td>
                <td className="p-2 text-right">
                  <Button variant="secondary" className="mr-2" onClick={() => toggleEnable(it)}>{it.enabled ? 'Disable' : 'Enable'}</Button>
                  <Button onClick={() => runOnce(it.id)}>Run Once</Button>
                </td>
              </tr>
            ))}
            {!loading && items.length===0 && <tr><td className="p-4" colSpan={6}>No detections yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}


