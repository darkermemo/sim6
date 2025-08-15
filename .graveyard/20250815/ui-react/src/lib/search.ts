import { apiFetch } from './api';

// Time input types
export type TimeInput =
  | { last_seconds: number }
  | { from: string; to: string }; // ISO 8601

// Search execute types
export type SearchExecuteReq = {
  tenant_id: number;
  time: TimeInput;
  q?: string;        // free text / DSL
  limit?: number;    // default 1000, max 10000
  fields?: string[]; // optional projection
};

export type SearchMeta = { 
  took_ms: number; 
  row_count: number;
};

export type SearchRow = Record<string, unknown>;

export type SearchExecuteRes = { 
  meta: SearchMeta; 
  data: SearchRow[];
};

// Search compile types
export type SearchCompileReq = { 
  tenant_id: number; 
  time: TimeInput; 
  q?: string;
};

export type SearchCompileRes = {
  sql: string;
  warnings?: string[];
};

// Facets types
export type FacetBucket = { 
  value: string; 
  count: number;
};

export type FacetsReq = {
  tenant_id: number;
  time: TimeInput;
  q?: string;
  fields: string[]; // e.g., ["log_source","user","src_ip"]
  size?: number;    // per facet, default 10
};

export type FacetsRes = Record<string, FacetBucket[]>;

// API client functions
export const searchApi = {
  compile: (req: SearchCompileReq) => 
    apiFetch<SearchCompileRes>('/search/compile', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  execute: (req: SearchExecuteReq) =>
    apiFetch<SearchExecuteRes>('/search/execute', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  facets: (req: FacetsReq) =>
    apiFetch<FacetsRes>('/search/facets', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  tail: (req: SearchExecuteReq) =>
    apiFetch<{ message: string }>('/search/tail', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  export: (req: SearchExecuteReq) =>
    apiFetch<{ link: string }>('/search/export', {
      method: 'POST',
      body: JSON.stringify(req),
    }),
};

// Helper to convert time range strings to TimeInput
export function parseTimeRange(range: string): TimeInput {
  switch (range) {
    case '15m':
      return { last_seconds: 15 * 60 };
    case '1h':
      return { last_seconds: 60 * 60 };
    case '24h':
      return { last_seconds: 24 * 60 * 60 };
    case '7d':
      return { last_seconds: 7 * 24 * 60 * 60 };
    default:
      // For custom, return last 1h as default
      return { last_seconds: 60 * 60 };
  }
}
