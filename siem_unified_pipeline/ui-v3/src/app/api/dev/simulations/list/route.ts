import { NextResponse } from "next/server";
export const runtime = "nodejs";

const scenarios = [
  { id:"seq_fail50_then_success", name:"50 fails then success (3m)", est_rows:51 },
  { id:"absence_reset_no_mfa",    name:"Reset without MFA (10m)",   est_rows:1  },
  { id:"chain_login_consent_rule",name:"Login→Consent→Mailbox",     est_rows:3  },
  { id:"rolling_fails_5m",        name:">100 fails in 5m",          est_rows:120},
  { id:"ratio_fail_success",      name:"Fail:Success >20:1",        est_rows:205},
  { id:"first_seen_country",      name:"First-seen country",        est_rows:1  },
  { id:"beaconing",               name:"Beaconing RSD<0.2",         est_rows:25 },
  { id:"diversity_spread",        name:"Fan-out ≥20 users (10m)",   est_rows:25 },
];

export async function GET() {
  if (process.env.ENABLE_ATTACK_SIM !== "1")
    return NextResponse.json({ error: "disabled" }, { status: 403 });
  return NextResponse.json({ scenarios });
}


