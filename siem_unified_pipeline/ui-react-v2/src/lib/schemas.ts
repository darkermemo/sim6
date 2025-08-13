import { z } from 'zod';

// FieldMeta used by UI
export const FieldMeta = z.object({
  name: z.string(),
  type: z.string(),
  label: z.string().optional(),
  cardinality: z.enum(['low', 'high']).optional(),
});
export type FieldMeta = z.infer<typeof FieldMeta>;

// Accepts: [{name,type,label?,cardinality?}] OR {fields:[...]} OR anything → FieldMeta[]
export const FieldsIn = z.any().transform<FieldMeta[]>((input) => {
  const fromArray = (arr: any[]) =>
    arr
      .map((f) => ({
        name: String(f?.name ?? ''),
        type: String((f && (f.type ?? (f as any)["r#type"])) ?? 'String'),
        label: f?.label ? String(f.label) : String(f?.name ?? ''),
        cardinality: ((): 'low' | 'high' | undefined => {
          if (f?.cardinality === 'low') return 'low';
          if (f?.cardinality === 'high') return 'high';
          return undefined;
        })(),
      }))
      .filter((f) => f.name.length > 0);

  if (Array.isArray(input)) return fromArray(input);
  if (input && Array.isArray((input as any).fields)) return fromArray((input as any).fields);
  return [];
});

// Enums normalizer
export const EnumsIn = z.any().transform<Record<string, string[]>>((input) => {
  const out: Record<string, string[]> = {};
  if (!input) return out;

  if (Array.isArray(input)) {
    for (const e of input) {
      const key = String(e?.name ?? '');
      const vals = Array.isArray(e?.values)
        ? e.values.map(String)
        : e?.value != null
          ? [String(e.value)]
          : [];
      if (key) out[key] = vals;
    }
    return out;
  }
  if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = (v as unknown[]).map(String);
      else if (v != null) out[k] = [String(v)];
      else out[k] = [];
    }
    return out;
  }
  return out;
});

// Grammar: optional; default to empty arrays
export const Grammar = z
  .object({
    tokens: z.array(z.string()).default([]),
    functions: z.array(z.string()).default([]),
    examples: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    operators: z.array(z.string()).default([]),
    specials: z.array(z.string()).default([]),
  })
  .partial()
  .transform((g) => ({
    tokens: g.tokens ?? [],
    functions: g.functions ?? [],
    examples: g.examples ?? [],
    keywords: g.keywords ?? [],
    operators: g.operators ?? [],
    specials: g.specials ?? [],
  }));
export type Grammar = z.infer<typeof Grammar>;

export const SchemaBundle = z.object({
  fields: z.array(FieldMeta),
  enums: z.record(z.string(), z.array(z.string())),
  grammar: z.lazy(() => Grammar),
});
export type SchemaBundle = z.infer<typeof SchemaBundle>;

// Compile/Execute responses (minimal)
export const SearchCompileReq = z.lazy(() => z.object({
  tenant_id: z.string(),
  time: z
    .object({
      last_seconds: z.number().int().positive().optional(),
      from: z.number().int().optional(),
      to: z.number().int().optional(),
    })
    .partial()
    .optional(),
  q: z.string(),
}));
export type SearchCompileReq = z.infer<typeof SearchCompileReq>;

export const SearchCompileRes = z.object({
  sql: z.string(),
  warnings: z.array(z.string()).default([]),
  where_sql: z.string().optional(),
});
export type SearchCompileRes = z.infer<typeof SearchCompileRes>;

export const MetaColumn = z.object({ name: z.string(), type: z.string().optional().default('String') });
export const SearchExecuteRes = z.lazy(() => z.object({
  data: z.object({
    data: z.array(z.unknown()),
    meta: z.array(MetaColumn).default([]),
    rows: z.number().optional(),
    statistics: z.unknown().optional(),
  }),
  sql: z.string().optional(),
  took_ms: z.number().optional(),
}));
export type SearchExecuteRes = z.infer<typeof SearchExecuteRes>;

export const FacetBucket = z.object({ value: z.string(), count: z.number() });
export const SearchFacetsRes = z.lazy(() => z.object({
  facets: z.record(z.string(), z.array(FacetBucket)).default({}),
}));
export type SearchFacetsRes = z.infer<typeof SearchFacetsRes>;

export const TimelinePoint = z.object({ ts: z.number(), count: z.number() });
export const SearchTimelineRes = z
  .object({ buckets: z.array(TimelinePoint).default([]) })
  .or(z.object({ series: z.array(TimelinePoint).default([]) }))
  .transform((v) => ('buckets' in v ? v : { buckets: v.series }));

// Dashboard minimal
export const SeriesPoint = z.object({ ts: z.number(), value: z.number() });
export const TimeSeriesRes = z.object({
  series: z.array(SeriesPoint).default([]),
  totals: z.record(z.string(), z.number()).default({}),
});
export type TimeSeriesRes = z.infer<typeof TimeSeriesRes>;


