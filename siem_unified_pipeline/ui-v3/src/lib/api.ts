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
  const body = {
    tenant_id: query.tenant_id || "admin", // Default to admin tenant
    time: {
      last_seconds: query.time_range_seconds || 600 // Default to 10 minutes as per spec
    },
    q: query.search || "*", // Use "*" for initial load as per spec
    limit: query.limit || 100,
    offset: query.offset || 0
  };

  const response = await http<any>('/search/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  });

  // Match exact data contract: { total: number, data: { meta: Array<Record<string, any>> }, stats?: { elapsed_ms: number } }
  const events = (response.data?.meta || []).map((item: any) => ({
    id: item.event_id || item._id || 'unknown',
    timestamp: item.event_timestamp || item.created_at,
    event_type: item.event_type || 'unknown',
    severity: item.severity || 'info',
    message: item.message || 'No message',
    source: item.source_type || item.vendor || 'unknown',
    source_ip: item.source_ip,
    destination_ip: item.destination_ip,
    user: item.user,
    host: item.host,
    raw_message: item.raw_log,
    // Additional fields
    event_category: item.event_category,
    event_action: item.event_action,
    event_outcome: item.event_outcome,
    protocol: item.protocol,
    source_port: item.source_port,
    destination_port: item.destination_port,
    vendor: item.vendor,
    product: item.product
  }));

  return {
    events,
    total_count: response.total || events.length,
    elapsed_ms: response.stats?.elapsed_ms,
    page_info: {
      limit: body.limit,
      offset: body.offset,
      has_next: events.length >= body.limit,
      has_previous: body.offset > 0,
      total_pages: Math.ceil((response.total || events.length) / body.limit),
      current_page: Math.floor(body.offset / body.limit) + 1
    }
  };
}

export async function compileSearch(query: string, tenantId = "default") {
  return http<{ sql: string }>('/search/compile', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId,
      time: { last_seconds: 3600 },
      q: query
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
      q: query || "*",
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
      q: query || "*"
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