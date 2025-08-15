/**
 * Golden Standard API Client
 * Implements exact contract from specification
 */

import * as Types from './search-types';
import { get, post, del, patch, API_ROOT, getOptional, httpGet, httpPost } from './http';
import { z } from 'zod';

// ---- Zod shapes for API normalization ----
const FieldZ = z.object({
  name: z.string(),
  type: z.string().default('String'),
});
const FieldsEnvelopeZ = z.object({ fields: z.array(FieldZ) });
const FieldsResponseZ = z.union([FieldsEnvelopeZ, z.array(FieldZ)]);

const EnumsFlatZ = z.record(z.string(), z.array(z.string()));
const EnumsEnvelopeZ = z.object({ enums: EnumsFlatZ });
const EnumsResponseZ = z.union([EnumsEnvelopeZ, EnumsFlatZ]).default({});

// Grammar disabled in MVP to ensure no bundle contains grammar calls

// ---- Normalizers ----
function normalizeFields(raw: unknown): Types.FieldMeta[] {
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

function normalizeEnums(raw: unknown): Record<string, string[]> {
  const parsed = EnumsResponseZ.parse(raw);
  const obj = ('enums' in parsed) ? parsed.enums : parsed;
  // ensure arrays
  return Object.fromEntries(Object.entries(obj).map(([k,v]) => [k, Array.isArray(v) ? v : []]));
}

// No grammar normalization in MVP

// ---- Public API used by Search page ----
// Schema optional in MVP page; keep helpers available if needed elsewhere
export async function fetchSchemaFields(signal?: AbortSignal): Promise<Types.FieldMeta[]> {
  const raw = await httpGet<unknown>('/schema/fields', { signal });
  return normalizeFields(raw);
}

export async function fetchEnums(signal?: AbortSignal): Promise<Record<string, string[]>> {
  const raw = await httpGet<unknown>('/schema/enums', { 
    signal, 
    optional: true, 
    defaultValue: {} 
  });
  return normalizeEnums(raw);
}

// No fetchGrammar in MVP

// Safe compile/execute with error handling
export async function compileQuery(body: {
  tenant_id: string; 
  time?: Types.TimeRange; 
  q: string
}): Promise<Types.CompileResult> {
  return httpPost<Types.CompileResult>('/search/compile', body);
}

export async function executeQuery(body: {
  tenant_id: string; 
  time?: Types.TimeRange; 
  q: string; 
  limit?: number; 
  sort?: Types.SortSpec[]
}): Promise<Types.ExecuteResult> {
  return httpPost<Types.ExecuteResult>('/search/execute', body);
}

// Optional endpoints with safe defaults
export async function fetchTimeline(body: any, signal?: AbortSignal): Promise<{ buckets: Types.TimelineBucket[] }> {
  return httpPost<{ buckets: Types.TimelineBucket[] }>('/search/timeline', body, { 
    signal, 
    optional: true, 
    defaultValue: { buckets: [] }
  });
}

export async function fetchFacets(body: any, signal?: AbortSignal): Promise<{ facets: Record<string, Types.FacetBucket[]> }> {
  return httpPost<{ facets: Record<string, Types.FacetBucket[]> }>('/search/facets', body, { 
    signal, 
    optional: true, 
    defaultValue: { facets: {} }
  });
}

export const api = {
  // Health check
  health: () => get<any>(`/health`),

  // Schema endpoints
  schema: {
    fields: (tenant_id: string) =>
      get<Types.FieldMeta[]>(`/schema/fields?tenant_id=${encodeURIComponent(tenant_id)}`),

    enums: (tenant_id: string) =>
      get<Record<string, string[]>>(`/schema/enums?tenant_id=${encodeURIComponent(tenant_id)}`),
  },

  // Search endpoints
  search: {
    // No grammar in MVP

    compile: (body: { tenant_id: string; time: Types.TimeRange; q: string }) =>
      post<Types.CompileResult>(`/search/compile`, body),

    execute: (body: { 
      tenant_id: string; 
      time: Types.TimeRange; 
      q: string;
      limit?: number;
      sort?: Types.SortSpec[];
    }) => post<Types.ExecuteResult>(`/search/execute`, body),

    facets: (body: {
      tenant_id: string;
      time: Types.TimeRange;
      q: string;
      facets: Array<{ field: string; limit: number }>;
    }) => post<{ facets: Record<string, Types.FacetBucket[]> }>(`/search/facets`, body),

    timeline: (body: {
      tenant_id: string;
      time: Types.TimeRange;
      q: string;
      interval_ms: number;
    }) => post<{ buckets: Types.TimelineBucket[] }>(`/search/timeline`, body),

    // SSE tail endpoint
    tail: (body: {
      tenant_id: string;
      time: Types.TimeRange;
      q: string;
      limit?: number;
      select?: string[];
    }): EventSource => {
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
    create: (body: {
      tenant_id: string;
      name: string;
      query: string;
      time: Types.TimeRange;
      options?: { limit?: number };
    }) => post<{ saved_id: string }>(`/search/saved`, body),

    list: (tenant_id: string, limit = 50) =>
      get<{ items: Types.SavedSearch[] }>(`/search/saved?tenant_id=${encodeURIComponent(tenant_id)}&limit=${limit}`),

    get: (id: string) => get<Types.SavedSearch>(`/search/saved/${id}`),

    update: (id: string, body: { name?: string }) =>
      patch<{ updated: boolean }>(`/search/saved/${id}`, body),

    delete: (id: string) => del<{ deleted: boolean }>(`/search/saved/${id}`),
  },

  // Pins
  pins: {
    add: (saved_id: string) =>
      post<{ pin_id: string }>(`/search/pins`, { saved_id }),

    remove: (pin_id: string) => del<{ deleted: boolean }>(`/search/pins/${pin_id}`),
  },

  // History
  history: {
    list: (tenant_id: string, limit = 100) =>
      get<{ items: Array<{
          history_id: string;
          tenant_id: string;
          q: string;
          time: Types.TimeRange;
          executed_at: number;
        }> }>(`/search/history?tenant_id=${encodeURIComponent(tenant_id)}&limit=${limit}`),

    delete: (id: string) => del<{ deleted: boolean }>(`/search/history/${id}`),
  },

  // Exports
  exports: {
    create: (body: {
      tenant_id: string;
      time: Types.TimeRange;
      q: string;
      format: Types.ExportFormat;
    }) => post<{ export_id: string }>(`/search/exports`, body),

    get: (id: string) => get<Types.Export>(`/search/exports/${id}`),
  },
};

// Schema bundle fetcher with normalization and safe defaults
export async function fetchSchemaBundle(): Promise<{
  fields: Types.FieldMeta[];
  enums: Record<string, string[]>;
  grammar: Types.Grammar;
}> {
  try {
    const [fieldsAny, enumsAny] = await Promise.all([
      getOptional<unknown>(`/schema/fields`),
      getOptional<unknown>(`/schema/enums`),
    ]);
    
    // Safe parsing with fallbacks
    const fields = FieldsResponseZ.parse(fieldsAny ?? []) as unknown as Types.FieldMeta[];
    const enums = EnumsResponseZ.parse(enumsAny ?? {});
    const grammar = { tokens: [], functions: [], examples: [], keywords: [], operators: [], specials: [] } as Types.Grammar;
    
    // Ensure we return the parsed data correctly
    return {
      fields,
      enums: enums as Record<string, string[]>,
      grammar
    };
  } catch (err: any) {
    console.warn('Schema bundle failed, using safe defaults:', err?.message ?? 'unknown error');
    // Return safe defaults that won't crash the UI
    return {
      fields: [],
      enums: {},
      grammar: { tokens: [], functions: [], examples: [], keywords: [], operators: [], specials: [] }
    };
  }
}
