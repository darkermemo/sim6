import { expect, it } from 'vitest';
// Placeholders for client and compileDSL; adapt to your project wiring
import { createClient } from '@clickhouse/client';
import { loadSchema, resolve, tryResolve } from '../src/lib/schema-cache';
import { expandOutcome } from '../src/lib/outcome';
import { rewriteIpPredicates } from '../src/lib/ip';

const client = createClient({ url: 'http://localhost:8123' } as any);
const DB = 'dev'; const T = 'events';

async function compileDSL(dsl: string) {
  const { cols, types } = await loadSchema(client as any, DB, T);
  let where = dsl
    .replace(/\boutcome\s*=\s*['"]success['"]/gi, 'success')
    .replace(/\boutcome\s*=\s*['"]fail(ed)?['"]/gi, 'fail')
    .replace(/\bsuccess\b/g, `(${expandOutcome('success', cols)})`)
    .replace(/\bfail\b/g, `(${expandOutcome('fail', cols)})`);
  for (const c of ['user','src_ip','dest_ip','host','event_type','event_id','message']) {
    const phys = tryResolve(c, cols);
    if (phys && phys !== c) where = where.replace(new RegExp(`\\b${c}\\b`, 'g'), phys);
  }
  for (const key of ['src_ip','dest_ip']) {
    const col = tryResolve(key, cols); if (!col) continue;
    where = rewriteIpPredicates(where, col, (types as any)[col]);
  }
  const ts = resolve('ts', cols);
  const sql = `SELECT * FROM ${DB}.${T} WHERE ${ts} >= now64(3) - toIntervalSecond(600)` + (where && where!=='*' ? ` AND (${where})` : '') + ` ORDER BY ${ts} DESC LIMIT 100`;
  return { sql };
}

it('SSH success without result column', async () => {
  const q = `event_type='ssh' AND success within=10m`;
  const { sql } = await compileDSL(q);
  expect(sql).toMatch(/match\(.+accepted/i);
});

it('Windows success/fail by event_id', async () => {
  const q = `event_id IN (4624,4625) AND (success OR fail) within=5m`;
  const { sql } = await compileDSL(q);
  expect(sql).toMatch(/event_id IN \(4624,4768,4769,4776\)/);
  expect(sql).toMatch(/event_id IN \(4625,4771\)/);
});

it('Canonical user_name maps to user', async () => {
  const q = `user_name='admin' within=90d`;
  const { sql } = await compileDSL(q);
  expect(sql).toMatch(/\buser='admin'/);
});

it('IP regex casts source_ip', async () => {
  const q = `NOT match(source_ip, '^10\\.') within=30d`;
  const { sql } = await compileDSL(q);
  expect(sql).toMatch(/match\(IPv[46]NumToString\(source_ip\), '\^10\\\.'\)/);
});

it('Unknown identifier yields suggestions (simulated)', async () => {
  // Here we just ensure resolver throws on fake field
  await expect((async () => resolve('fake_field', (await loadSchema(client as any, DB, T)).cols))()).rejects.toThrow();
});


