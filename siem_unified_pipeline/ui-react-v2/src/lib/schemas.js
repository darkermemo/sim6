import { z } from 'zod';
// FieldMeta used by UI
export const FieldMeta = z.object({
    name: z.string(),
    type: z.string(),
    label: z.string().optional(),
    cardinality: z.enum(['low', 'high']).optional(),
});
// Accepts: [{name,type,label?,cardinality?}] OR {fields:[...]} OR anything → FieldMeta[]
export const FieldsIn = z.any().transform((input) => {
    const fromArray = (arr) => arr
        .map((f) => ({
        name: String(f?.name ?? ''),
        type: String((f && (f.type ?? f["r#type"])) ?? 'String'),
        label: f?.label ? String(f.label) : String(f?.name ?? ''),
        cardinality: (() => {
            if (f?.cardinality === 'low')
                return 'low';
            if (f?.cardinality === 'high')
                return 'high';
            return undefined;
        })(),
    }))
        .filter((f) => f.name.length > 0);
    if (Array.isArray(input))
        return fromArray(input);
    if (input && Array.isArray(input.fields))
        return fromArray(input.fields);
    return [];
});
// Enums normalizer
export const EnumsIn = z.any().transform((input) => {
    const out = {};
    if (!input)
        return out;
    if (Array.isArray(input)) {
        for (const e of input) {
            const key = String(e?.name ?? '');
            const vals = Array.isArray(e?.values)
                ? e.values.map(String)
                : e?.value != null
                    ? [String(e.value)]
                    : [];
            if (key)
                out[key] = vals;
        }
        return out;
    }
    if (typeof input === 'object') {
        for (const [k, v] of Object.entries(input)) {
            if (Array.isArray(v))
                out[k] = v.map(String);
            else if (v != null)
                out[k] = [String(v)];
            else
                out[k] = [];
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
export const SchemaBundle = z.object({
    fields: z.array(FieldMeta),
    enums: z.record(z.string(), z.array(z.string())),
    grammar: z.lazy(() => Grammar),
});
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
export const SearchCompileRes = z.object({
    sql: z.string(),
    warnings: z.array(z.string()).default([]),
    where_sql: z.string().optional(),
});
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
export const FacetBucket = z.object({ value: z.string(), count: z.number() });
export const SearchFacetsRes = z.lazy(() => z.object({
    facets: z.record(z.string(), z.array(FacetBucket)).default({}),
}));
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
