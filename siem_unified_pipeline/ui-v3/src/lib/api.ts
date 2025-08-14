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
  const params = new URLSearchParams();
  
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  
  return fetchApi<EventSearchResponse>(`/api/v2/events/search?${params.toString()}`);
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
  const params = new URLSearchParams();
  if (windowSeconds) params.append('window_seconds', String(windowSeconds));
  
  return fetchApi<EpsStatsResponse>(`/api/v2/metrics/eps?${params.toString()}`);
}

// ============================================================================
// Dashboard API
// ============================================================================

export async function getDashboard(): Promise<DashboardResponse> {
  try {
    // Fetch quick metrics which contains total events and source count
    const quickMetrics = await fetchApi<{
      total_events: number;
      total_bytes_estimate: number;
      source_count: number;
    }>('/api/v2/metrics/quick');
    
    // Construct dashboard response from available data
    const dashboardResponse: DashboardResponse = {
      kpis: {
        total_events_24h: quickMetrics.total_events,
        total_alerts_24h: 0, // No alert data available yet
        active_rules: 0, // Would need rules endpoint
        avg_eps: 0, // Will be filled from EPS endpoint
        system_health: "ok"
      },
      recent_alerts: [], // No alerts data available yet
      top_sources: [], // Would need sources data
      timestamp: new Date().toISOString()
    };
    
    return dashboardResponse;
  } catch (error) {
    // Fallback to mock data if endpoint doesn't exist
    throw error; // Let the UI handle the fallback
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
