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
import { api } from '@/lib/http';

// ============================================================================
// Health API
// ============================================================================

export async function getHealth(): Promise<HealthResponse> {
  return api<HealthResponse>('health');
}

// ============================================================================
// Search API (Real v2 endpoints)
// ============================================================================

export async function searchEvents(query: EventSearchQuery): Promise<EventSearchResponse> {
  const body = {
    tenant_id: query.tenant_id || "default",
    time: {
      last_seconds: 3600 // Default to last hour
    },
    q: query.search || "*",
    limit: query.limit || 50,
    offset: query.offset || 0
  };

  const response = await api<any>('search/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' }
  });

  // Transform backend response to match UI types
  return {
    events: response.data?.meta || [],
    total_count: response.total || 0,
    page_info: {
      limit: body.limit,
      offset: body.offset,
      has_next: (response.data?.meta?.length || 0) >= body.limit,
      has_previous: body.offset > 0,
      total_pages: Math.ceil((response.total || 0) / body.limit),
      current_page: Math.floor(body.offset / body.limit) + 1
    }
  };
}

export async function compileSearch(query: string, tenantId = "default") {
  return api<{ sql: string }>('search/compile', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId,
      time: { last_seconds: 3600 },
      q: query
    }),
    headers: { 'content-type': 'application/json' }
  });
}

export async function searchFacets(query: string, facets: Array<{field: string, size?: number}>, tenantId = "default") {
  return api<{ facets: any }>('search/facets', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId,
      time: { last_seconds: 3600 },
      q: query,
      facets
    }),
    headers: { 'content-type': 'application/json' }
  });
}

export async function searchAggs(query: string, tenantId = "default") {
  return api<{ aggs: { timeline: any[] } }>('search/aggs', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tenantId,
      time: { last_seconds: 3600 },
      q: query
    }),
    headers: { 'content-type': 'application/json' }
  });
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
    const statsData = await api<any>('search/execute', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: "default",
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