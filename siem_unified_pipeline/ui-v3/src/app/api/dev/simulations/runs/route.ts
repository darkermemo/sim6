import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  if (process.env.ENABLE_ATTACK_SIM !== "1")
    return NextResponse.json({ error: "disabled" }, { status: 403 });

  const ch = process.env.CH_URL || "http://127.0.0.1:8123";
  const db = process.env.CH_DB || "siem_v3";
  const sql = `
    SELECT run_id, ts, tenant_id, scenario, inserted
    FROM attack_sim_runs
    ORDER BY ts DESC
    LIMIT 200
    FORMAT JSON
  `.trim();

  const r = await fetch(`${ch}/?database=${encodeURIComponent(db)}&default_format=JSON`, {
    method: "POST",
    body: sql,
    headers: { "content-type": "text/plain" },
  });
  if (!r.ok) return NextResponse.json({ ok:false, status:r.status, text: await r.text() }, { status: 500 });
  const j = await r.json();
  return NextResponse.json({ ok:true, rows: j.data ?? [] });
}


