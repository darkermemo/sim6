// schema-cache.ts
import type { ClickHouseClient } from '@clickhouse/client';

type Key = `${string}.${string}`;
type Entry = { at: number; cols: Set<string>; types: Record<string, string> };
const TTL = 60_000;
const MEM = new Map<Key, Entry>();

export async function loadSchema(client: ClickHouseClient, db: string, table: string): Promise<Entry> {
  const key: Key = `${db}.${table}`;
  const hit = MEM.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TTL) return hit;

  const r = await (client as any).query({
    query: `SELECT name,type FROM system.columns WHERE database={db:String} AND table={t:String}`,
    query_params: { db, t: table }
  });
  const rows = (await r.json<{ data: { name: string; type: string }[] }>() ).data;
  const cols = new Set<string>(rows.map(x => x.name));
  const types: Record<string, string> = Object.fromEntries(rows.map(x => [x.name, x.type]));
  const val: Entry = { at: now, cols, types };
  MEM.set(key, val);
  return val;
}

const CANDIDATES: Record<string, string[]> = {
  ts:        ['event_timestamp','@timestamp','ts','time','datetime'],
  user:      ['user','user_name','username','account','subject_user','sAMAccountName'],
  src_ip:    ['src_ip','source_ip','client_ip','src','srcAddress'],
  dest_ip:   ['dest_ip','destination_ip','server_ip','dst','dstAddress'],
  host:      ['host','computer','hostname'],
  event_type:['event_type','type','category','program','syslog_program'],
  message:   ['message','msg','log','_raw'],
  event_id:  ['event_id','eid','win_event_id','id'],
  status:    ['Status','status','result','outcome','auth_result'],
  extra:     ['extra','json','payload','_json']
};

export function resolve(canonical: string, cols: Set<string>): string {
  for (const n of CANDIDATES[canonical] || [canonical]) if (cols.has(n)) return n;
  throw new Error(`unknown field: ${canonical}`);
}

export function tryResolve(canonical: string, cols: Set<string>): string | undefined {
  try { return resolve(canonical, cols); } catch { return undefined; }
}


