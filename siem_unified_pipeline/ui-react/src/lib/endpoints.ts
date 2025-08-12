import type { Health, SearchExecuteRequest } from "../types/api";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "/";

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  health: () => getJson<Health>("/health"),
  metricsText: async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(`${API_BASE}/metrics`, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(t);
    }
  },
  searchExecute: (body: SearchExecuteRequest) => getJson<any>("/api/v2/search/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
};

export type ApiClient = typeof api;

import type {
  HealthResponse,
  SearchExecuteResponse,
  SearchFacetRequest,
  SearchFacetResponse,
  AlertsListResponse,
  TenantsList,
  TenantLimits,
  SavedSearchList,
  SavedSearchCreate,
  SavedSearchGet,
} from '@/types/api'

// Type definitions for fetch API
interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Blob | FormData | null;
  signal?: AbortSignal;
}

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

export const Endpoints = {
  health: (): Promise<HealthResponse> => http('/api/v2/health'),

  // Search
  searchCompile: (dslOrBody: unknown): Promise<{ sql: string; where_sql?: string; warnings?: unknown[] }> =>
    http('/api/v2/search/compile', { method: 'POST', body: JSON.stringify(dslOrBody) }),

  searchExecute: (dsl: unknown): Promise<SearchExecuteResponse> =>
    http('/api/v2/search/execute', { method: 'POST', body: JSON.stringify({ dsl }) }),

  searchFacets: (req: SearchFacetRequest): Promise<SearchFacetResponse> =>
    http('/api/v2/search/facets', { method: 'POST', body: JSON.stringify(req) }),

  // Alerts
  listAlerts: (limit = 50): Promise<AlertsListResponse> => http(`/api/v2/alerts?limit=${limit}`),

  // Admin Tenants
  listTenants: (): Promise<TenantsList> => http('/api/v2/admin/tenants'),
  getTenantLimits: (tenantId: string): Promise<TenantLimits> => http(`/api/v2/admin/tenants/${tenantId}/limits`),
  putTenantLimits: (tenantId: string, body: TenantLimits): Promise<{ ok: true }> => http(`/api/v2/admin/tenants/${tenantId}/limits`, { method: 'PUT', body: JSON.stringify(body) }),

  // Saved Searches
  listSaved: (tenant_id: string, q?: string, limit = 50): Promise<SavedSearchList> => {
    const params = new URLSearchParams({ tenant_id, limit: String(limit) })
    if (q && q.trim()) params.set('q', q)
    return http(`/api/v2/search/saved?${params.toString()}`)
  },
  createSaved: (tenant_id: string, name: string, dsl: unknown): Promise<SavedSearchCreate> =>
    http('/api/v2/search/saved', { method: 'POST', body: JSON.stringify({ tenant_id, name, dsl }) }),
  getSaved: (saved_id: string, tenant_id: string): Promise<SavedSearchGet> => http(`/api/v2/search/saved/${saved_id}?tenant_id=${encodeURIComponent(tenant_id)}`),
  deleteSaved: (saved_id: string, tenant_id: string): Promise<{ ok: boolean }> => http(`/api/v2/search/saved/${saved_id}?tenant_id=${encodeURIComponent(tenant_id)}`, { method: 'DELETE' }),
}


