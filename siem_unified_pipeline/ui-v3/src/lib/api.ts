/**
 * API Client for SIEM UI v3
 * 
 * Provides typed HTTP client functions for the Rust backend API
 */

import { 
  HealthResponse, 
  EventSearchQuery, 
  EventSearchResponse, 
  EventDetail,
  DashboardResponse,
  RulesListResponse,
  EpsStatsResponse,
  EventCountResponse,
  ApiResponse
} from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9999';

class ApiError extends Error {
  constructor(public status: number, message: string, public details?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      
      throw new ApiError(response.status, errorMessage, errorText);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Health API
// ============================================================================

export async function getHealth(): Promise<HealthResponse> {
  return fetchApi<HealthResponse>('/api/v2/health');
}

export async function getDetailedHealth(): Promise<HealthResponse> {
  return fetchApi<HealthResponse>('/api/v2/health/detailed');
}

// ============================================================================
// Events API
// ============================================================================

export async function searchEvents(query: EventSearchQuery): Promise<EventSearchResponse> {
  const searchBody = {
    tenant_id: query.tenant_id || "default",
    time: {
      last_seconds: 3600 // Default to last hour
    },
    q: query.search || "*",
    limit: query.limit || 50,
    offset: query.offset || 0
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/v2/search/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchBody)
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform backend response to match UI types
    return {
      events: data.data?.meta || [],
      total_count: data.total || 0,
      page_info: {
        limit: searchBody.limit,
        offset: searchBody.offset,
        has_next: (data.data?.meta?.length || 0) >= searchBody.limit,
        has_previous: searchBody.offset > 0,
        total_pages: Math.ceil((data.total || 0) / searchBody.limit),
        current_page: Math.floor(searchBody.offset / searchBody.limit) + 1
      }
    };
  } catch (error) {
    console.error('Search API error:', error);
    throw error;
  }
}

export async function getEventById(id: string): Promise<EventDetail> {
  return fetchApi<EventDetail>(`/api/v1/events/${id}`);
}

export async function getEventCount(startTime?: string, endTime?: string, tenantId?: string): Promise<EventCountResponse> {
  const params = new URLSearchParams();
  if (startTime) params.append('start_time', startTime);
  if (endTime) params.append('end_time', endTime);
  if (tenantId) params.append('tenant_id', tenantId);
  
  return fetchApi<EventCountResponse>(`/api/v1/events/count?${params.toString()}`);
}

export async function getEpsStats(windowSeconds?: number): Promise<EpsStatsResponse> {
  // EPS endpoint not implemented in v2 API - return mock data
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

// ============================================================================
// Dashboard API
// ============================================================================

export async function getDashboard(): Promise<DashboardResponse> {
  // Use available v2 endpoints - get health status 
  try {
    const health = await getHealth();
    
    // Construct dashboard response with real health data and mock metrics
    const dashboardResponse: DashboardResponse = {
      kpis: {
        total_events_24h: 0, // Would need metrics endpoint implementation
        total_alerts_24h: 0, // Would need alerts endpoint
        active_rules: 0, // Would need rules endpoint
        avg_eps: 0, // Would need EPS endpoint
        system_health: health.status === "ok" ? "ok" : "degraded"
      },
      recent_alerts: [], // Would need alerts endpoint
      top_sources: [], // Would need metrics endpoint  
      timestamp: new Date().toISOString()
    };
    
    return dashboardResponse;
  } catch (error) {
    // Return minimal mock data for UI
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
// Rules API
// ============================================================================

export async function getRules(limit?: number, offset?: number): Promise<RulesListResponse> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', String(limit));
  if (offset) params.append('offset', String(offset));
  
  return fetchApi<RulesListResponse>(`/api/v1/rules?${params.toString()}`);
}

// ============================================================================
// Server-Sent Events
// ============================================================================

export function createEventStream(
  onEvent: (event: any) => void,
  onError?: (error: Error) => void,
  filters?: { source?: string; severity?: string }
) {
  const params = new URLSearchParams();
  if (filters?.source) params.append('source', filters.source);
  if (filters?.severity) params.append('severity', filters.severity);
  
  const url = `${API_BASE_URL}/api/v1/events/stream?${params.toString()}`;
  const eventSource = new EventSource(url);
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch (error) {
      console.error('Failed to parse SSE event:', error);
    }
  };
  
  eventSource.onerror = (event) => {
    const error = new Error('EventSource failed');
    onError?.(error);
  };
  
  return eventSource;
}

// ============================================================================
// Export utilities
// ============================================================================

export { ApiError };
export type { ApiResponse };
