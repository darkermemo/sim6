import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (process.env.ENABLE_ATTACK_SIM !== "1")
    return NextResponse.json({ error: "disabled" }, { status: 403 });

  const { tenant_id = "t_fixture", scenarios = ["all"], scale = 1 } = await req.json();

  const args = [
    "tools/fixtures/generate_attack_fixtures.py",
    "--tenant", tenant_id,
    "--scenarios", Array.isArray(scenarios) ? scenarios.join(",") : String(scenarios),
    "--scale", String(scale),
  ];

  const env = { ...process.env };
  return new Promise<NextResponse>((resolve) => {
    const p = spawn("python3", args, { cwd: process.cwd(), env });
    let out = ""; let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0) {
        try { return resolve(NextResponse.json(JSON.parse(out || "{}"))); }
        catch { return resolve(NextResponse.json({ ok:true, raw: out }, { status: 200 })); }
      } else {
        return resolve(NextResponse.json({ ok:false, code, err, out }, { status: 500 }));
      }
    });
  });
}


