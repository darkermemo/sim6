/**
 * Complete API client for SIEM v2
 * Implements all search, schema, saved, export, and streaming endpoints
 */
export const API_BASE = (import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ?? "") + "/api/v2";
/**
 * Parse JSON response with error handling and auth redirect
 */
async function json(res) {
    if (!res.ok) {
        if (res.status === 401) {
            window.location.href = "/ui/v2/login";
        }
        const text = await res.text();
        let error;
        try {
            error = JSON.parse(text);
        }
        catch {
            error = { error: text, code: "UNKNOWN", details: {} };
        }
        throw error;
    }
    return res.json();
}
/**
 * Complete API client with all endpoints
 */
export const api = {
    // Health check
    health: () => fetch(`${API_BASE}/health`).then((json)),
    // Search endpoints
    search: {
        compile: (body) => fetch(`${API_BASE}/search/compile`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        execute: (body) => fetch(`${API_BASE}/search/execute`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        estimate: (body) => fetch(`${API_BASE}/search/estimate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        facets: (body) => fetch(`${API_BASE}/search/facets`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        timeline: (body) => fetch(`${API_BASE}/search/timeline`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        // SSE streaming
        tail: (body) => {
            // For SSE, we need to use EventSource with POST support
            // Most browsers don't support POST with EventSource, so we use a workaround
            const params = new URLSearchParams({
                tenant_id: body.tenant_id,
                q: body.q,
                stream_id: body.stream_id,
                time: JSON.stringify(body.time),
                select: JSON.stringify(body.select || []),
            });
            return new EventSource(`${API_BASE}/search/tail?${params.toString()}`);
        },
        tailUpdate: (stream_id, q) => fetch(`${API_BASE}/search/tail/update`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ stream_id, q }),
        }).then((json)),
        tailStop: (stream_id) => fetch(`${API_BASE}/search/tail/stop`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ stream_id }),
        }).then((json)),
    },
    // Schema endpoints
    schema: {
        fields: (tenant_id) => fetch(`${API_BASE}/schema/fields?tenant_id=${encodeURIComponent(tenant_id)}`)
            .then((json)),
        enums: (tenant_id) => fetch(`${API_BASE}/schema/enums?tenant_id=${encodeURIComponent(tenant_id)}`)
            .then((json)),
        // grammar disabled in MVP
    },
    // Saved searches CRUD
    saved: {
        create: (body) => fetch(`${API_BASE}/search/saved`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        list: (tenant_id, limit = 50, cursor) => {
            const params = new URLSearchParams({ tenant_id, limit: String(limit) });
            if (cursor)
                params.set("cursor", cursor);
            return fetch(`${API_BASE}/search/saved?${params}`)
                .then((json));
        },
        get: (id) => fetch(`${API_BASE}/search/saved/${id}`)
            .then((json)),
        update: (id, body) => fetch(`${API_BASE}/search/saved/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        delete: (id) => fetch(`${API_BASE}/search/saved/${id}`, {
            method: "DELETE",
        }).then((json)),
    },
    // Pins
    pins: {
        create: (tenant_id, saved_search_id) => fetch(`${API_BASE}/search/pins`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tenant_id, saved_search_id }),
        }).then((json)),
        list: (tenant_id) => fetch(`${API_BASE}/search/pins?tenant_id=${encodeURIComponent(tenant_id)}`)
            .then((json)),
        delete: (pin_id) => fetch(`${API_BASE}/search/pins/${pin_id}`, {
            method: "DELETE",
        }).then((json)),
    },
    // Templates
    templates: {
        create: (body) => fetch(`${API_BASE}/search/templates`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        list: () => fetch(`${API_BASE}/search/templates`)
            .then((json)),
        get: (id) => fetch(`${API_BASE}/search/templates/${id}`)
            .then((json)),
        update: (id, body) => fetch(`${API_BASE}/search/templates/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        delete: (id) => fetch(`${API_BASE}/search/templates/${id}`, {
            method: "DELETE",
        }).then((json)),
    },
    // History
    history: {
        list: (tenant_id, limit = 100) => fetch(`${API_BASE}/search/history?tenant_id=${encodeURIComponent(tenant_id)}&limit=${limit}`)
            .then((json)),
        delete: (id) => fetch(`${API_BASE}/search/history/${id}`, {
            method: "DELETE",
        }).then((json)),
        clear: () => fetch(`${API_BASE}/search/history`, {
            method: "DELETE",
        }).then((json)),
    },
    // Exports
    exports: {
        create: (body) => fetch(`${API_BASE}/search/exports`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).then((json)),
        get: (id) => fetch(`${API_BASE}/search/exports/${id}`)
            .then((json)),
        delete: (id) => fetch(`${API_BASE}/search/exports/${id}`, {
            method: "DELETE",
        }).then((json)),
    },
    // Autocomplete
    suggest: {
        fields: (tenant_id, prefix) => fetch(`${API_BASE}/search/suggest/fields?tenant_id=${encodeURIComponent(tenant_id)}&prefix=${encodeURIComponent(prefix)}`)
            .then((json)),
        values: (tenant_id, field, prefix, limit = 10) => fetch(`${API_BASE}/search/suggest/values?tenant_id=${encodeURIComponent(tenant_id)}&field=${encodeURIComponent(field)}&prefix=${encodeURIComponent(prefix)}&limit=${limit}`)
            .then((json)),
        tokens: (prefix) => fetch(`${API_BASE}/search/suggest/tokens?prefix=${encodeURIComponent(prefix)}`)
            .then((json)),
    },
};
