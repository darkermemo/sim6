/**
 * API client module - single authority for all API interactions
 * Handles auth redirects, error parsing, and typed requests/responses
 */
export const API_BASE = (import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ?? "") + "/api/v2";
/**
 * Parse JSON response with error handling and auth redirect
 */
async function json(res) {
    if (!res.ok) {
        if (res.status === 401) {
            // placeholder auth handling
            window.location.href = "/ui/v2/login";
        }
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
}
/**
 * API endpoint functions - No SQL exposure
 */
export const api = {
    health: () => fetch(`${API_BASE}/health`).then((json)),
    // Validate search intent without execution
    compile: (intent) => fetch(`${API_BASE}/search/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intent)
    }).then((json)),
    // Execute search with structured intent (old API for now)
    search: (intent) => fetch(`${API_BASE}/search/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            tenant_id: intent.tenant_id,
            time: intent.time,
            q: intent.q,
            limit: intent.limit
        })
    }).then((json)).then(res => ({
        data: res.data.data,
        meta: res.data.meta,
        statistics: {
            rows: res.data.rows,
            took_ms: res.took_ms || 0,
            rows_read: res.data.statistics?.rows_read || 0,
            bytes_read: res.data.statistics?.bytes_read || 0,
        }
    })),
    // Dashboard panels batch query
    panels: (req) => fetch(`${API_BASE}/dashboards/panels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req)
    }).then((json)),
    // SSE tail endpoint (if implemented)
    tail: (intent) => {
        const qp = new URLSearchParams({
            tenant_id: intent.tenant_id,
            q: intent.q,
            last_seconds: String(intent.time?.last_seconds ?? 60)
        });
        return new EventSource(`${API_BASE}/search/tail?${qp.toString()}`);
    },
};
