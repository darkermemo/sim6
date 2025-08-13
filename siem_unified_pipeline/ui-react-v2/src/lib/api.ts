/**
 * API client module - single authority for all API interactions
 * Handles auth redirects, error parsing, and typed requests/responses
 */

export const API_BASE =
  (import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ?? "") + "/api/v2";

/**
 * Parse JSON response with error handling and auth redirect
 */
async function json<T>(res: Response): Promise<T> {
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

// Request/Response types - No SQL exposed
export type SearchIntent = {
  tenant_id: string;
  time: { 
    last_seconds?: number;
    from?: number;
    to?: number;
  };
  q: string;
  limit?: number;
};

export type CompileResp = {
  valid: boolean;
  error?: string;
};

export type SearchResponse = {
  data: any[];
  meta: { 
    name: string; 
    type: string;
  }[];
  statistics: {
    rows: number;
    took_ms: number;
    rows_read: number;
    bytes_read: number;
  };
};

// Dashboard types
export type PanelDef = 
  | { kind: "timeseries_count"; id: string; filters?: PanelFilters }
  | { kind: "by_severity_top"; id: string; limit?: number }
  | { kind: "single_stat"; id: string; stat: "count" | "unique_users" | "unique_sources"; filters?: PanelFilters }
  | { kind: "top_sources"; id: string; limit?: number }
  | { kind: "event_types"; id: string; limit?: number };

export type PanelFilters = {
  severity?: string;
  event_type?: string;
};

export type PanelsRequest = {
  tenant_id: string;
  time: { from: number; to: number; interval_seconds?: number };
  panels: PanelDef[];
};

export type PanelResult = {
  id: string;
  columns: string[];
  rows: any[];
  error?: string;
};

/**
 * API endpoint functions - No SQL exposure
 */
export const api = {
  health: () => 
    fetch(`${API_BASE}/health`).then(json<any>),
  
  // Validate search intent without execution
  compile: (intent: SearchIntent) =>
    fetch(`${API_BASE}/search/compile`, { 
      method: "POST", 
      headers: { "content-type": "application/json" }, 
      body: JSON.stringify(intent) 
    }).then(json<CompileResp>),
  
  // Execute search with structured intent (old API for now)
  search: (intent: SearchIntent) =>
    fetch(`${API_BASE}/search/execute`, { 
      method: "POST", 
      headers: { "content-type": "application/json" }, 
      body: JSON.stringify({
        tenant_id: intent.tenant_id,
        time: intent.time,
        q: intent.q,
        limit: intent.limit
      }) 
    }).then(json<any>).then(res => ({
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
  panels: (req: PanelsRequest) =>
    fetch(`${API_BASE}/dashboards/panels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req)
    }).then(json<{ results: PanelResult[] }>),
  
  // SSE tail endpoint (if implemented)
  tail: (intent: SearchIntent): EventSource => {
    const qp = new URLSearchParams({
      tenant_id: intent.tenant_id,
      q: intent.q,
      last_seconds: String(intent.time?.last_seconds ?? 60)
    });
    return new EventSource(`${API_BASE}/search/tail?${qp.toString()}`);
  },
};
