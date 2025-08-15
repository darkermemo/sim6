/**
 * Search API Hooks - Typed React Query hooks for all search operations
 * 
 * This module provides enterprise-grade API hooks with:
 * - Zod schema validation at the boundary
 * - TanStack Query caching and error handling
 * - Defensive programming against optional endpoints
 * - TypeScript-first design
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { get, post, getOptional } from '@/lib/http';

// === ZOD SCHEMAS ===

const FieldMetaZ = z.object({
  name: z.string(),
  type: z.string(),
  label: z.string().optional(),
  cardinality: z.number().optional(),
  searchable: z.boolean().optional(),
  facetable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  doc: z.string().optional(),
});

const ExecuteResultZ = z.object({
  sql: z.string(),
  data: z.object({
    meta: z.array(z.object({
      name: z.string(),
      type: z.string(),
    })),
    data: z.array(z.record(z.string(), z.any())).default([]),
    rows: z.number().optional().default(0),
    rows_before_limit_at_least: z.number().optional().default(0),
    statistics: z.any().optional(),
  }),
  took_ms: z.number(),
});

const CompileResultZ = z.object({
  sql: z.string(),
  where_sql: z.string().optional(),
  warnings: z.array(z.string()).optional().default([]),
});

const TimelineBucketZ = z.object({
  timestamp: z.number(),
  count: z.number(),
  interval: z.string().optional(),
});

const FacetBucketZ = z.object({
  value: z.string(),
  count: z.number(),
});

const TimelineResultZ = z.object({
  buckets: z.array(TimelineBucketZ).default([]),
});

const FacetsResultZ = z.object({
  facets: z.record(z.string(), z.array(FacetBucketZ)).default({}),
});

const SchemaFieldsZ = z.object({
  fields: z.array(FieldMetaZ).default([]),
});

const SchemaEnumsZ = z.object({
  enums: z.record(z.string(), z.array(z.string())).default({}),
});

const GrammarZ = z.object({
  operators: z.array(z.string()).default([]),
  field_ops: z.record(z.string(), z.string()).optional(),
  fields: z.array(z.string()).default([]),
}).optional();

// === TYPES ===

export type FieldMeta = z.infer<typeof FieldMetaZ>;
export type ExecuteResult = z.infer<typeof ExecuteResultZ>;
export type CompileResult = z.infer<typeof CompileResultZ>;
export type TimelineBucket = z.infer<typeof TimelineBucketZ>;
export type FacetBucket = z.infer<typeof FacetBucketZ>;
export type TimelineResult = z.infer<typeof TimelineResultZ>;
export type FacetsResult = z.infer<typeof FacetsResultZ>;
export type SchemaFields = z.infer<typeof SchemaFieldsZ>;
export type SchemaEnums = z.infer<typeof SchemaEnumsZ>;
export type Grammar = z.infer<typeof GrammarZ>;

// === REQUEST TYPES ===

export interface SearchRequest extends Record<string, unknown> {
  tenant_id: string;
  q: string;
  time: {
    last_seconds?: number;
    from?: number;
    to?: number;
  };
  limit?: number;
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
}

export interface CompileRequest extends Record<string, unknown> {
  tenant_id: string;
  q: string;
  time: {
    last_seconds?: number;
    from?: number;
    to?: number;
  };
}

export interface FacetsRequest extends Record<string, unknown> {
  tenant_id: string;
  q: string;
  time: {
    last_seconds?: number;
    from?: number;
    to?: number;
  };
  facets?: Array<{
    field: string;
    size?: number;
  }>;
}

// === QUERY KEYS ===

const searchKeys = {
  all: ['search'] as const,
  compile: (params: CompileRequest) => [...searchKeys.all, 'compile', params] as const,
  execute: (params: SearchRequest) => [...searchKeys.all, 'execute', params] as const,
  timeline: (params: SearchRequest) => [...searchKeys.all, 'timeline', params] as const,
  facets: (params: FacetsRequest) => [...searchKeys.all, 'facets', params] as const,
  schema: {
    fields: (table?: string) => [...searchKeys.all, 'schema', 'fields', table] as const,
    enums: (params: { tenant_id?: string; last_seconds?: number }) => 
      [...searchKeys.all, 'schema', 'enums', params] as const,
    grammar: () => [...searchKeys.all, 'schema', 'grammar'] as const,
  },
};

// === HOOKS ===

/**
 * Compile query to SQL with syntax validation
 */
export function useCompile(params: CompileRequest, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: searchKeys.compile(params),
    queryFn: async (): Promise<CompileResult> => {
      const response = await post('/search/compile', params);
      return CompileResultZ.parse(response);
    },
    enabled: options?.enabled ?? true,
    staleTime: 5_000, // Short stale time for compile - users expect fresh SQL
  });
}

/**
 * Execute search query and return results
 */
export function useExecute(params: SearchRequest, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: searchKeys.execute(params),
    queryFn: async (): Promise<ExecuteResult> => {
      const response = await post('/search/execute', params);
      return ExecuteResultZ.parse(response);
    },
    enabled: options?.enabled ?? true,
    staleTime: 30_000, // Longer stale time for results
  });
}

/**
 * Get timeline aggregation for visualization
 */
export function useTimeline(params: SearchRequest, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: searchKeys.timeline(params),
    queryFn: async (): Promise<TimelineResult> => {
      const response = await post('/search/aggs', {
        ...params,
        aggs: ['timeline'],
      }) as any;
      
      // Handle both direct buckets response and wrapped response
      const buckets = response.buckets || response.aggs?.timeline || [];
      return TimelineResultZ.parse({ buckets });
    },
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * Get facets for the right panel
 */
export function useFacets(params: FacetsRequest, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: searchKeys.facets(params),
    queryFn: async (): Promise<FacetsResult> => {
      const response = await post('/search/facets', params);
      return FacetsResultZ.parse(response);
    },
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * Get schema fields (optional endpoint)
 */
export function useSchemaFields(table = 'events', options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: searchKeys.schema.fields(table),
    queryFn: async (): Promise<SchemaFields> => {
      // Use getOptional for graceful 404 handling
      const response = await getOptional(`/schema/fields?table=${table}`);
      if (!response) {
        return { fields: [] };
      }
      return SchemaFieldsZ.parse(response);
    },
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60_000, // 5 minutes - schema doesn't change often
  });
}

/**
 * Get schema enums (optional endpoint)
 */
export function useSchemaEnums(
  params: { tenant_id?: string; last_seconds?: number } = {},
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: searchKeys.schema.enums(params),
    queryFn: async (): Promise<SchemaEnums> => {
      const queryParams = new URLSearchParams();
      if (params.tenant_id) queryParams.set('tenant_id', params.tenant_id);
      if (params.last_seconds) queryParams.set('last_seconds', params.last_seconds.toString());
      
      const url = `/schema/enums${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      const response = await getOptional(url);
      if (!response) {
        return { enums: {} };
      }
      return SchemaEnumsZ.parse(response);
    },
    enabled: options?.enabled ?? true,
    staleTime: 2 * 60_000, // 2 minutes - enums change based on recent data
  });
}

/**
 * Get grammar help (optional endpoint)
 */
export function useGrammar(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: searchKeys.schema.grammar(),
    queryFn: async (): Promise<Grammar | null> => {
      const response = await getOptional('/search/grammar');
      if (!response) {
        return null;
      }
      return GrammarZ.parse(response) || null;
    },
    enabled: options?.enabled ?? true,
    staleTime: 10 * 60_000, // 10 minutes - grammar is static
  });
}

/**
 * Query invalidation helper
 */
export function useSearchInvalidation() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: searchKeys.all }),
    invalidateExecute: () => queryClient.invalidateQueries({ queryKey: [...searchKeys.all, 'execute'] }),
    invalidateSchema: () => queryClient.invalidateQueries({ queryKey: [...searchKeys.all, 'schema'] }),
  };
}
