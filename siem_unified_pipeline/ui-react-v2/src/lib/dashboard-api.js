/**
 * Dashboard API Client - Golden Standard
 * Following exact pattern from search-golden
 */
import { get } from './http';
// Helper to build query string
function buildQuery(params) {
    const filtered = Object.entries(params)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
    return filtered.length > 0 ? `?${filtered.join('&')}` : '';
}
// GET helper
async function apiGet(path, params) {
    const query = params ? buildQuery(params) : '';
    return get(`${path}${query}`);
}
// Dashboard API endpoints
export const dashboardApi = {
    health: () => apiGet('/health'),
    ingest: (params) => apiGet('/dashboard/ingest', params),
    queryStats: (params) => apiGet('/dashboard/query', params),
    storage: (params) => apiGet('/dashboard/storage', params),
    errors: (params) => apiGet('/dashboard/errors', params),
    recentAlerts: (params) => apiGet('/alerts', params),
    freshness: (params) => apiGet('/dashboard/freshness', params),
};
