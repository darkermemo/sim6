/**
 * Complete API client for SIEM v2
 * Implements all search, schema, saved, export, and streaming endpoints
 */

import * as Types from './api-types';

export const API_BASE =
  (import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ?? "") + "/api/v2";

/**
 * Parse JSON response with error handling and auth redirect
 */
async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = "/ui/v2/login";
    }
    const text = await res.text();
    let error: Types.ErrorResponse;
    try {
      error = JSON.parse(text);
    } catch {
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
  health: () => 
    fetch(`${API_BASE}/health`).then(json<any>),

  // Search endpoints
  search: {
    compile: (body: Types.SearchCompileRequest) =>
      fetch(`${API_BASE}/search/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<Types.SearchCompileResponse>),

    execute: (body: Types.SearchExecuteRequest) =>
      fetch(`${API_BASE}/search/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<Types.SearchExecuteResponse>),

    estimate: (body: Types.SearchEstimateRequest) =>
      fetch(`${API_BASE}/search/estimate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<Types.SearchEstimateResponse>),

    facets: (body: Types.SearchFacetsRequest) =>
      fetch(`${API_BASE}/search/facets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<Types.SearchFacetsResponse>),

    timeline: (body: Types.SearchTimelineRequest) =>
      fetch(`${API_BASE}/search/timeline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<Types.SearchTimelineResponse>),

    // SSE streaming
    tail: (body: Types.SearchTailRequest): EventSource => {
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

    tailUpdate: (stream_id: string, q: string) =>
      fetch(`${API_BASE}/search/tail/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stream_id, q }),
      }).then(json<{ ok: boolean }>),

    tailStop: (stream_id: string) =>
      fetch(`${API_BASE}/search/tail/stop`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stream_id }),
      }).then(json<{ ok: boolean }>),
  },

  // Schema endpoints
  schema: {
    fields: (tenant_id: string) =>
      fetch(`${API_BASE}/schema/fields?tenant_id=${encodeURIComponent(tenant_id)}`)
        .then(json<Types.SchemaFieldsResponse>),

    enums: (tenant_id: string) =>
      fetch(`${API_BASE}/schema/enums?tenant_id=${encodeURIComponent(tenant_id)}`)
        .then(json<Types.SchemaEnumsResponse>),
    // grammar disabled in MVP
  },

  // Saved searches CRUD
  saved: {
    create: (body: Types.CreateSavedSearchRequest) =>
      fetch(`${API_BASE}/search/saved`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<{ saved_search_id: string }>),

    list: (tenant_id: string, limit = 50, cursor?: string) => {
      const params = new URLSearchParams({ tenant_id, limit: String(limit) });
      if (cursor) params.set("cursor", cursor);
      return fetch(`${API_BASE}/search/saved?${params}`)
        .then(json<Types.SavedSearchesResponse>);
    },

    get: (id: string) =>
      fetch(`${API_BASE}/search/saved/${id}`)
        .then(json<Types.SavedSearch>),

    update: (id: string, body: Types.UpdateSavedSearchRequest) =>
      fetch(`${API_BASE}/search/saved/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<{ updated: boolean }>),

    delete: (id: string) =>
      fetch(`${API_BASE}/search/saved/${id}`, {
        method: "DELETE",
      }).then(json<{ deleted: boolean }>),
  },

  // Pins
  pins: {
    create: (tenant_id: string, saved_search_id: string) =>
      fetch(`${API_BASE}/search/pins`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id, saved_search_id }),
      }).then(json<{ pin_id: string }>),

    list: (tenant_id: string) =>
      fetch(`${API_BASE}/search/pins?tenant_id=${encodeURIComponent(tenant_id)}`)
        .then(json<{ items: Types.Pin[] }>),

    delete: (pin_id: string) =>
      fetch(`${API_BASE}/search/pins/${pin_id}`, {
        method: "DELETE",
      }).then(json<{ deleted: boolean }>),
  },

  // Templates
  templates: {
    create: (body: Omit<Types.SearchTemplate, "template_id" | "created_at" | "updated_at">) =>
      fetch(`${API_BASE}/search/templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<{ template_id: string }>),

    list: () =>
      fetch(`${API_BASE}/search/templates`)
        .then(json<{ items: Types.SearchTemplate[] }>),

    get: (id: string) =>
      fetch(`${API_BASE}/search/templates/${id}`)
        .then(json<Types.SearchTemplate>),

    update: (id: string, body: Partial<Types.SearchTemplate>) =>
      fetch(`${API_BASE}/search/templates/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<{ updated: boolean }>),

    delete: (id: string) =>
      fetch(`${API_BASE}/search/templates/${id}`, {
        method: "DELETE",
      }).then(json<{ deleted: boolean }>),
  },

  // History
  history: {
    list: (tenant_id: string, limit = 100) =>
      fetch(`${API_BASE}/search/history?tenant_id=${encodeURIComponent(tenant_id)}&limit=${limit}`)
        .then(json<{ items: Types.SearchHistoryItem[] }>),

    delete: (id: string) =>
      fetch(`${API_BASE}/search/history/${id}`, {
        method: "DELETE",
      }).then(json<{ deleted: boolean }>),

    clear: () =>
      fetch(`${API_BASE}/search/history`, {
        method: "DELETE",
      }).then(json<{ deleted: boolean }>),
  },

  // Exports
  exports: {
    create: (body: Types.CreateExportRequest) =>
      fetch(`${API_BASE}/search/exports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<{ export_id: string; status: string }>),

    get: (id: string) =>
      fetch(`${API_BASE}/search/exports/${id}`)
        .then(json<Types.Export>),

    delete: (id: string) =>
      fetch(`${API_BASE}/search/exports/${id}`, {
        method: "DELETE",
      }).then(json<{ deleted: boolean }>),
  },

  // Autocomplete
  suggest: {
    fields: (tenant_id: string, prefix: string) =>
      fetch(`${API_BASE}/search/suggest/fields?tenant_id=${encodeURIComponent(tenant_id)}&prefix=${encodeURIComponent(prefix)}`)
        .then(json<Types.SuggestFieldsResponse>),

    values: (tenant_id: string, field: string, prefix: string, limit = 10) =>
      fetch(`${API_BASE}/search/suggest/values?tenant_id=${encodeURIComponent(tenant_id)}&field=${encodeURIComponent(field)}&prefix=${encodeURIComponent(prefix)}&limit=${limit}`)
        .then(json<Types.SuggestValuesResponse>),

    tokens: (prefix: string) =>
      fetch(`${API_BASE}/search/suggest/tokens?prefix=${encodeURIComponent(prefix)}`)
        .then(json<Types.SuggestTokensResponse>),
  },
};
