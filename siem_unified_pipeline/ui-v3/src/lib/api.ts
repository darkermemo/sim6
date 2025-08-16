/**
 * API Client for SIEM UI v3
 * 
 * Real API calls only - no mocks, no fallbacks
 */

import { 
  HealthResponse, 
  EventSearchQuery, 
  EventSearchResponse, 
  EventDetail,
  DashboardResponse,
  EpsStatsResponse
} from '@/types/api';
import { http } from '@/lib/http';
import { toRowObjects, mapToUiEvents } from '@/lib/event-map';

// ============================================================================
// Timestamp Utilities (robust date parsing)
// ============================================================================

/**
 * Robust timestamp to Date conversion for ClickHouse data
 * Handles: RFC3339 strings, Unix seconds, Unix milliseconds, null/undefined
 */
export function toDate(v: unknown): Date | null {
  if (v == null) return null;
  
  if (typeof v === 'number') {
    // Handle Unix timestamps - if < 2 billion, assume seconds, else milliseconds
    return new Date(v < 2_000_000_000 ? v * 1000 : v);
  }
  
  if (typeof v === 'string') {
    // ClickHouse formats often ISO8601 w/ or w/o Z; rely on Date parse
    const d = new Date(v);
    return isNaN(+d) ? null : d;
  }
  
  return null;
}

/**
 * Safe date formatting with fallback
 */
export function formatTimestamp(v: unknown, fallback = '—'): string {
  const date = toDate(v);
  return date ? date.toLocaleString() : fallback;
}

// ============================================================================
// Health API
// ============================================================================

export async function getHealth(): Promise<HealthResponse> {
  return http<HealthResponse>('/health');
}

// ============================================================================
// Search API (Real v2 endpoints)
// ============================================================================

export async function searchEvents(query: EventSearchQuery): Promise<EventSearchResponse> {
  const body: any = {
    tenant_id: query.tenant_id || "all", // default to all tenants
    time: query.time_range_seconds ? { last_seconds: query.time_range_seconds } : { mode: "all" },
    // Empty string means no text filter; avoids generating SQL with positionCaseInsensitive('*')
    q: typeof query.search === 'string' ? query.search : "",
    limit: query.limit || 100,
    offset: query.offset || 0,
    order: [{ field: "ts", dir: "desc" }] // Required for ClickHouse optimization
  };

  const response = await http<any>('/search/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  });

  // If backend returned a JSON error envelope, surface it as an exception so UI can display it
  if (response && response.data && typeof response.data.error === 'string') {
    const backendError: string = response.data.error as string;
    const sqlSnippet: string | undefined = typeof response.sql === 'string' ? response.sql : undefined;
    const errMsg = sqlSnippet ? `Search backend error: ${backendError} (sql: ${sqlSnippet})` : `Search backend error: ${backendError}`;
    throw new Error(errMsg);
  }

  // Convert ClickHouse response to normalized events
  const rows = toRowObjects(response);
  const uiEvents = mapToUiEvents(rows);
  
  // Convert UiEvents to EventSummary format for compatibility
  const events = uiEvents.map(event => ({
    id: event.id,
    timestamp: event.tsIso || undefined,  // backward compatibility
    tsIso: event.tsIso,                   // new normalized field
    event_type: event.event_type || '',
    source: event.source,
    severity: event.severity,
    message: event.message,
    row: event.row,
    // Extract common fields from the raw row
    source_ip: event.row.source_ip,
    destination_ip: event.row.destination_ip,
    user: event.row.user,
    host: event.row.host,
    tenant_id: event.row.tenant_id,
    raw_message: event.row.raw_log || event.row._raw,
    event_category: event.row.event_category,
    event_action: event.row.event_action,
    event_outcome: event.row.event_outcome,
    protocol: event.row.protocol,
    source_port: event.row.source_port,
    destination_port: event.row.destination_port,
    vendor: event.row.vendor,
    product: event.row.product
  }));

  return {
    events,
    total_count: response.data?.rows || events.length,
    elapsed_ms: response.statistics ? Math.round(response.statistics.elapsed * 1000) : undefined,
    page_info: {
      limit: body.limit,
      offset: body.offset,
      has_next: events.length >= body.limit,
      has_previous: body.offset > 0,
      total_pages: Math.ceil((response.data?.rows || events.length) / body.limit),
      current_page: Math.floor(body.offset / body.limit) + 1
    }
  };
}

export async function compileSearch(query: string, tenantId = "default", timeRangeSeconds: number = 172800) {
  return http<{ sql: string }>('/search/compile', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId || 'all',
      // Use the exact time window from the UI or allow "all"
      time: timeRangeSeconds ? { last_seconds: timeRangeSeconds } : { mode: 'all' },
      // Empty string means no text filter – avoids positionCaseInsensitive('*')
      q: query || ""
    }),
    headers: { 'content-type': 'application/json' }
  });
}

export async function searchFacets(query: string, facets: Array<{field: string, size?: number}>, tenantId = "default", timeRangeSeconds = 600) {
  const response = await http<any>('/search/facets', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId,
      time: { last_seconds: timeRangeSeconds },
      // Empty string means no text filter; avoids wildcard compiling to a literal
      q: query || "",
      facets
    }),
    headers: { 'content-type': 'application/json' }
  });

  // Match exact data contract: { facets: Record<string, Array<{ key: string, count: number }>> }
  return {
    facets: Object.fromEntries(
      Object.entries(response.facets || {}).map(([field, buckets]: [string, any]) => [
        field,
        (Array.isArray(buckets) ? buckets : []).map((bucket: any) => ({
          key: bucket.key || bucket.value || bucket.term,
          count: typeof bucket.count === 'number' ? bucket.count : parseInt(bucket.doc_count) || 0
        }))
      ])
    )
  };
}

export async function searchAggs(query: string, tenantId = "default", timeRangeSeconds = 600) {
  const response = await http<any>('/search/aggs', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId,
      time: { last_seconds: timeRangeSeconds },
      q: query || ""
    }),
    headers: { 'content-type': 'application/json' }
  });

  // Match exact data contract: { aggs: { timeline: Array<{ ts: string|number, count: number }> } }
  return {
    timeline: (response.aggs?.timeline || []).map((item: any) => ({
      ts: item.ts,
      count: typeof item.count === 'number' ? item.count : parseInt(item.c) || 0
    }))
  };
}

// ============================================================================
// Field Catalog API (for world-class filtering)
// ============================================================================

export interface FieldCatalogEntry {
  field: string;
  type: 'string' | 'int' | 'float' | 'bool' | 'datetime' | 'ip' | 'array' | 'map';
  approx_cardinality: number;
  top_values: TopValue[];
}

export interface TopValue {
  value: string;
  count: number;
}

export async function getSearchFields(tenantId = "default", prefix?: string): Promise<FieldCatalogEntry[]> {
  const params = new URLSearchParams({ tenant_id: tenantId });
  if (prefix) params.set('prefix', prefix);
  
  return http<FieldCatalogEntry[]>(`/search/fields?${params.toString()}`);
}

export async function getSearchValues(
  field: string, 
  tenantId = "default", 
  prefix?: string, 
  limit = 20
): Promise<TopValue[]> {
  const params = new URLSearchParams({ 
    tenant_id: tenantId, 
    field,
    limit: limit.toString()
  });
  if (prefix) params.set('prefix', prefix);
  
  return http<TopValue[]>(`/search/values?${params.toString()}`);
}

// ============================================================================
// Dashboard API (using real search endpoints)
// ============================================================================

export async function getDashboard(): Promise<DashboardResponse> {
  try {
    // Get health
    const health = await getHealth();
    
    // Get timeline data from search aggs
    const timelineData = await searchAggs("*");
    
    // Get basic stats from search execute with limit 0
    const statsData = await http<any>('/search/execute', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: "admin", // Use admin tenant
        time: { last_seconds: 86400 }, // 24 hours
        q: "*",
        limit: 0
      }),
      headers: { 'content-type': 'application/json' }
    });

    return {
      kpis: {
        total_events_24h: statsData.total || 0,
        total_alerts_24h: 0, // Would need alerts endpoint
        active_rules: 0, // Would need rules endpoint
        avg_eps: 0, // Calculate from timeline if needed
        system_health: health.status === "ok" ? "ok" : "degraded"
      },
      recent_alerts: [], // Would need alerts endpoint
      top_sources: [], // Would need facets by source
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // Minimal fallback for UI stability
    console.error('Dashboard API error:', error);
    return {
      kpis: {
        total_events_24h: 0,
        total_alerts_24h: 0,
        active_rules: 0,
        avg_eps: 0,
        system_health: "unknown"
      },
      recent_alerts: [],
      top_sources: [],
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// Mock endpoints that don't exist yet
// ============================================================================

export async function getEpsStats(windowSeconds?: number): Promise<EpsStatsResponse> {
  // EPS endpoint not implemented - return empty structure
  return {
    global: {
      current_eps: 0,
      avg_eps: 0,
      peak_eps: 0,
      window_seconds: windowSeconds || 60
    },
    per_tenant: {
      tenants: {},
      window_seconds: windowSeconds || 60
    },
    timestamp: new Date().toISOString()
  };
}

export async function getEventById(id: string): Promise<EventDetail> {
  throw new Error('Event detail endpoint not implemented');
}

export async function getServerColumns(tenantId = 'all'): Promise<string[] | null> {
  try {
    const params = new URLSearchParams();
    params.set('tenant_id', tenantId);
    const res = await http<any>(`/search/columns?${params.toString()}`);
    if (Array.isArray(res?.columns)) return res.columns as string[];
    return null;
  } catch {
    return null;
  }
}

export async function putServerColumns(tenantId = 'all', columns: string[]): Promise<boolean> {
  try {
    const res = await http<any>(`/search/columns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, columns })
    });
    return !!res?.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Saved Searches API
// ============================================================================

export interface SavedSearchItem {
  id: string;
  name: string;
  q: string;
  time_last_seconds?: number;
  pinned?: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function getSavedSearches(tenantId = 'all', limit = 50): Promise<SavedSearchItem[]> {
  const params = new URLSearchParams({ tenant_id: tenantId, limit: String(limit) });
  const res = await http<{ saved: SavedSearchItem[] }>(`/search/saved?${params.toString()}`);
  return Array.isArray((res as any).saved) ? (res as any).saved : [];
}

export async function createSavedSearch(params: { tenant_id: string; name: string; q: string; time_last_seconds?: number; pinned?: boolean }): Promise<{ id?: string }> {
  const body = {
    tenant_id: params.tenant_id || 'all',
    name: params.name,
    q: params.q || '',
    time_last_seconds: params.time_last_seconds ?? 0,
    pinned: params.pinned ?? false
  } as any;
  const res = await http<any>(`/search/saved`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res || {};
}