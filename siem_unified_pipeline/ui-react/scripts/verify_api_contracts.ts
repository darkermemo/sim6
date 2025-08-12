import { z } from "zod";

const API = process.env.API_BASE ?? "http://127.0.0.1:9999/api/v2";
const fetchJson = async (path: string, init?: RequestInit) => {
  const r = await fetch(`${API}${path}`, { 
    ...init, 
    headers: { 
      "content-type": "application/json", 
      ...(init?.headers||{}) 
    }
  });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
};

// Define critical schemas
const Health = z.object({
  status: z.enum(["ok","degraded"]).or(z.string()),
  clickhouse: z.object({ ok: z.boolean(), latency_ms: z.number().optional() }).optional(),
  redis_detail: z.object({ ok: z.boolean() }).optional()
});

const AlertsList = z.object({
  data: z.array(z.object({
    alert_id: z.string(), 
    created_at: z.string(), 
    severity: z.string(), 
    status: z.string(), 
    title: z.string().optional()
  })),
  meta: z.object({ 
    next_cursor: z.string().nullable().optional(), 
    row_count: z.number().optional() 
  })
});

const RulesList = z.object({
  data: z.array(z.object({
    rule_id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    created_at: z.string()
  })),
  meta: z.object({
    next_cursor: z.string().nullable().optional(),
    total: z.number().optional()
  })
});

const RulePacksList = z.object({
  packs: z.array(z.object({
    pack_id: z.string(),
    name: z.string(),
    created_at: z.string()
  })),
  next_cursor: z.string().nullable().optional(),
  total: z.number().optional()
});

const AdminTenants = z.object({
  tenants: z.array(z.object({
    tenant_id: z.number(),
    slug: z.string(),
    name: z.string(),
    status: z.string(),
    region: z.string()
  })),
  next_cursor: z.string().nullable().optional(),
  total: z.number().optional()
});

const AdminSources = z.object({
  sources: z.array(z.object({
    source_id: z.string(),
    name: z.string(),
    kind: z.string(),
    transport: z.string(),
    endpoint: z.string()
  })),
  next_cursor: z.string().nullable().optional(),
  total: z.number().optional()
});

const AdminParsers = z.object({
  parsers: z.array(z.object({
    parser_id: z.string(),
    name: z.string(),
    version: z.number(),
    kind: z.string()
  })),
  next_cursor: z.string().nullable().optional(),
  total: z.number().optional()
});

const AgentsList = z.object({
  agents: z.array(z.object({
    agent_id: z.string(),
    name: z.string(),
    kind: z.string(),
    online: z.boolean(),
    last_seen_at: z.string()
  })),
  next_cursor: z.string().nullable().optional(),
  total: z.number().optional()
});

async function main() {
  console.log(`🔍 Verifying API contracts against ${API}...`);
  
  const checks: Array<[string, () => Promise<void>]> = [
    ["/health", async () => { 
      Health.parse(await fetchJson("/health")); 
    }],
    ["/alerts", async () => { 
      AlertsList.parse(await fetchJson("/alerts?limit=25")); 
    }],
    ["/alert_rules", async () => { 
      RulesList.parse(await fetchJson("/alert_rules?limit=25")); 
    }],
    ["/rule-packs", async () => { 
      RulePacksList.parse(await fetchJson("/rule-packs?limit=25")); 
    }],
    ["/admin/tenants", async () => { 
      AdminTenants.parse(await fetchJson("/admin/tenants?limit=25")); 
    }],
    ["/admin/sources", async () => { 
      AdminSources.parse(await fetchJson("/admin/sources?limit=25")); 
    }],
    ["/admin/parsers", async () => { 
      AdminParsers.parse(await fetchJson("/admin/parsers?limit=25")); 
    }],
    ["/agents", async () => { 
      AgentsList.parse(await fetchJson("/agents?limit=25")); 
    }],
  ];

  const failures: string[] = [];
  for (const [name, fn] of checks) {
    try { 
      await fn(); 
      console.log(`✅ ${name}`);
    } catch (e: any) { 
      failures.push(`${name}: ${e.message}`); 
      console.log(`❌ ${name}: ${e.message}`);
    }
  }
  
  if (failures.length) {
    console.error("\n🚨 API CONTRACT FAILURES:");
    failures.forEach(f => console.error(`  ${f}`));
    process.exit(2);
  }
  
  console.log("\n🎉 API contracts: PASS");
}

main().catch(e => {
  console.error("Script error:", e);
  process.exit(1);
});
