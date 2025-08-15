"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DetectionsAPI } from "@/lib/detections";
import type { DetectionRecord } from "@/types/detections";
import { ActionButton } from "@/components/ui/ActionButton";

export default function DetectionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [det, setDet] = useState<DetectionRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { setDet(await DetectionsAPI.get(id)); } catch(e:any){ setErr(String(e)); }
  };
  useEffect(() => { if (id) load(); }, [id]);

  const runOnce = async () => { await DetectionsAPI.runOnce(id); };

  if (!id) return null;
  return (
    <div className="p-6 space-y-4">
      {err && <div className="text-sm text-red-600">{err}</div>}
      {!det ? (
        <div>Loading…</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">{det.name}</h1>
            <ActionButton 
              onClick={runOnce}
              data-action="detections:detail:run-once"
              data-intent="api"
              data-endpoint="/api/v2/detections/run"
            >
              Run Once
            </ActionButton>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded border p-4">
              <div className="font-medium mb-2">Spec</div>
              <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(det.spec, null, 2)}</pre>
            </div>
            <div className="rounded border p-4">
              <div className="font-medium mb-2">Metadata</div>
              <div className="text-sm">Severity: {det.severity}</div>
              <div className="text-sm">Owner: {det.owner}</div>
              <div className="text-sm">Enabled: {det.enabled ? 'Yes':'No'}</div>
              <div className="text-sm">Updated: {det.updated_at}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


