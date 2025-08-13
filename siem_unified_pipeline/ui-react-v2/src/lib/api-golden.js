/**
 * Golden Standard API Client
 * Implements exact contract from specification
 */
import { get, post, del, patch, API_ROOT, getOptional, httpGet, httpPost } from './http';
import { z } from 'zod';
// ---- Zod shapes for API normalization ----
const FieldZ = z.object({
    name: z.string(),
    type: z.string().default('String'),
});
const FieldsEnvelopeZ = z.object({ fields: z.array(FieldZ) });
const FieldsResponseZ = z.union([FieldsEnvelopeZ, z.array(FieldZ)]);
const EnumsFlatZ = z.record(z.array(z.string()));
const EnumsEnvelopeZ = z.object({ enums: EnumsFlatZ });
const EnumsResponseZ = z.union([EnumsEnvelopeZ, EnumsFlatZ]).default({});
// Grammar disabled in MVP to ensure no bundle contains grammar calls
// ---- Normalizers ----
function normalizeFields(raw) {
    const parsed = FieldsResponseZ.safeParse(raw);
    const list = parsed.success
        ? (Array.isArray(parsed.data) ? parsed.data : parsed.data.fields)
        : [];
    return list.map(f => ({
        name: f.name,
        type: f.type,
        label: f.name,
        cardinality: undefined,
        searchable: true,
        facetable: true,
        sortable: true,
        doc: undefined
    }));
}
function normalizeEnums(raw) {
    const parsed = EnumsResponseZ.parse(raw);
    const obj = ('enums' in parsed) ? parsed.enums : parsed;
    // ensure arrays
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Array.isArray(v) ? v : []]));
}
// No grammar normalization in MVP
// ---- Public API used by Search page ----
// Schema optional in MVP page; keep helpers available if needed elsewhere
export async function fetchSchemaFields(signal) {
    const raw = await httpGet('/schema/fields', { signal });
    return normalizeFields(raw);
}
export async function fetchEnums(signal) {
    const raw = await httpGet('/schema/enums', {
        signal,
        optional: true,
        defaultValue: {}
    });
    return normalizeEnums(raw);
}
// No fetchGrammar in MVP
// Safe compile/execute with error handling
export async function compileQuery(body) {
    return httpPost('/search/compile', body);
}
export async function executeQuery(body) {
    return httpPost('/search/execute', body);
}
// Optional endpoints with safe defaults
export async function fetchTimeline(body, signal) {
    return httpPost('/search/timeline', body, {
        signal,
        optional: true,
        defaultValue: { buckets: [] }
    });
}
export async function fetchFacets(body, signal) {
    return httpPost('/search/facets', body, {
        signal,
        optional: true,
        defaultValue: { facets: {} }
    });
}
export const api = {
    // Health check
    health: () => get(`/health`),
    // Schema endpoints
    schema: {
        fields: (tenant_id) => get(`/schema/fields?tenant_id=${encodeURIComponent(tenant_id)}`),
        enums: (tenant_id) => get(`/schema/enums?tenant_id=${encodeURIComponent(tenant_id)}`),
    },
    // Search endpoints
    search: {
        // No grammar in MVP
        compile: (body) => post(`/search/compile`, body),
        execute: (body) => post(`/search/execute`, body),
        facets: (body) => post(`/search/facets`, body),
        timeline: (body) => post(`/search/timeline`, body),
        // SSE tail endpoint
        tail: (body) => {
            // Note: Most browsers don't support POST with EventSource
            // This is a workaround - backend should ideally support GET
            const params = new URLSearchParams({
                tenant_id: body.tenant_id,
                q: body.q,
                time: JSON.stringify(body.time),
                limit: String(body.limit || 100),
            });
            return new EventSource(`${API_ROOT}/search/tail?${params.toString()}`);
        },
    },
    // Saved searches
    saved: {
        create: (body) => post(`/search/saved`, body),
        list: (tenant_id, limit = 50) => get(`/search/saved?tenant_id=${encodeURIComponent(tenant_id)}&limit=${limit}`),
        get: (id) => get(`/search/saved/${id}`),
        update: (id, body) => patch(`/search/saved/${id}`, body),
        delete: (id) => del(`/search/saved/${id}`),
    },
    // Pins
    pins: {
        add: (saved_id) => post(`/search/pins`, { saved_id }),
        remove: (pin_id) => del(`/search/pins/${pin_id}`),
    },
    // History
    history: {
        list: (tenant_id, limit = 100) => get(`/search/history?tenant_id=${encodeURIComponent(tenant_id)}&limit=${limit}`),
        delete: (id) => del(`/search/history/${id}`),
    },
    // Exports
    exports: {
        create: (body) => post(`/search/exports`, body),
        get: (id) => get(`/search/exports/${id}`),
    },
};
// Schema bundle fetcher with normalization and safe defaults
export async function fetchSchemaBundle() {
    try {
        const [fieldsAny, enumsAny] = await Promise.all([
            getOptional(`/schema/fields`),
            getOptional(`/schema/enums`),
        ]);
        // Safe parsing with fallbacks
        const fields = FieldsIn.parse(fieldsAny ?? []);
        const enums = EnumsIn.parse(enumsAny ?? {});
        const grammar = { tokens: [], functions: [], examples: [], keywords: [], operators: [], specials: [] };
        const bundle = { fields, enums, grammar };
        return bundle;
    }
    catch (err) {
        console.warn('Schema bundle failed, using safe defaults:', err?.message ?? 'unknown error');
        // Return safe defaults that won't crash the UI
        return {
            fields: [],
            enums: {},
            grammar: { tokens: [], functions: [], examples: [], keywords: [], operators: [], specials: [] }
        };
    }
}
