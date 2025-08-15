/**
 * Dashboard API Client - Golden Standard
 * Following exact pattern from search-golden
 */

import { 
  IngestResp, 
  QueryResp, 
  StorageResp, 
  ErrorsResp, 
  AlertsResp, 
  FreshnessResp, 
  Health 
} from './dashboard-types';
import { get } from './http';

// Helper to build query string
function buildQuery(params: Record<string, string | number | undefined>): string {
  const filtered = Object.entries(params)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return filtered.length > 0 ? `?${filtered.join('&')}` : '';
}

// GET helper
async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const query = params ? buildQuery(params) : '';
  return get<T>(`${path}${query}`);
}

// Dashboard API endpoints
export const dashboardApi = {
  health: () => apiGet<Health>('/health'),

  ingest: (params: { since?: string; until?: string; step?: string; tenant_id?: string }) =>
    apiGet<IngestResp>('/dashboard/ingest', params),

  queryStats: (params: { since?: string; until?: string; step?: string; tenant_id?: string }) =>
    apiGet<QueryResp>('/dashboard/query', params),

  storage: (params: { since?: string; until?: string; step?: string; tenant_id?: string }) =>
    apiGet<StorageResp>('/dashboard/storage', params),

  errors: (params: { since?: string; until?: string; step?: string; tenant_id?: string }) =>
    apiGet<ErrorsResp>('/dashboard/errors', params),

  recentAlerts: (params: { 
    since?: string; 
    until?: string; 
    limit?: number; 
    severity?: string; 
    status?: string; 
    tenant_id?: string 
  }) =>
    apiGet<AlertsResp>('/alerts', params),

  freshness: (params: { since?: string; until?: string; step?: string; tenant_id?: string }) =>
    apiGet<FreshnessResp>('/dashboard/freshness', params),
};
