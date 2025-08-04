import useSWR from 'swr';
import { useCallback } from 'react';
import { EventSearchResponse } from '../../types/events';
import { useAuthStore } from '../../stores/authStore';
import axios from 'axios';

interface EventsParams {
  tenantId?: string;
  query?: string;
  page?: number;
  limit?: number;
  startTime?: number;
  endTime?: number;
  sourceIp?: string;
  eventCategory?: string;
  eventOutcome?: string;
  eventAction?: string;
  sourceType?: string;
  cursor?: string; // For cursor-based pagination
  enableStreaming?: boolean; // Enable streaming for large datasets
}

interface EventCountParams {
  tenantId?: string;
  query?: string;
  startTime?: number;
  endTime?: number;
  sourceIp?: string;
  eventCategory?: string;
  eventOutcome?: string;
  eventAction?: string;
  sourceType?: string;
}

interface EventStreamParams {
  tenantId?: string;
}

/**
 * API function to search events using the new backend API
 */
export const getEvents = async (params: EventsParams): Promise<EventSearchResponse> => {
  const { accessToken } = useAuthStore.getState();
  
  // Build query parameters for GET request matching new backend API
  const queryParams = new URLSearchParams();
  
  // Add tenant ID (required)
  queryParams.append('tenantId', params.tenantId || 'default');
  
  // Add pagination (offset-based)
  if (params.page && params.limit) {
    const offset = (params.page - 1) * params.limit;
    queryParams.append('offset', offset.toString());
  }
  if (params.limit) {
    queryParams.append('limit', params.limit.toString());
  }
  
  // Add search query
  if (params.query) {
    queryParams.append('query', params.query);
  }
  
  // Add time range (ISO format)
  if (params.startTime) {
    queryParams.append('startTime', new Date(params.startTime * 1000).toISOString());
  }
  if (params.endTime) {
    queryParams.append('endTime', new Date(params.endTime * 1000).toISOString());
  }
  
  // Add individual filters (camelCase for backend)
  if (params.sourceIp) {
    queryParams.append('sourceIp', params.sourceIp);
  }
  if (params.eventCategory) {
    queryParams.append('eventType', params.eventCategory); // Map to eventType
  }
  if (params.sourceType) {
    queryParams.append('source', params.sourceType); // Map to source
  }

  const headers: Record<string, string> = {};
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await axios.get(
    `${import.meta.env.VITE_API_BASE || 'http://localhost:8000'}/api/v1/events/search?${queryParams.toString()}`,
    { headers }
  );

  // Transform the PagedEvents response to match EventSearchResponse format
  const transformedData: EventSearchResponse = {
    events: response.data.events?.map((event: any) => ({
      event_id: event.eventId || '',
      tenant_id: event.tenantId || 'default',
      event_timestamp: event.eventTimestamp || Math.floor(Date.now() / 1000),
      source_ip: event.sourceIp || '',
      source_type: event.source || 'unknown',
      source_name: event.source || 'unknown',
      raw_event: event.message || event.details || '',
      event_category: event.eventType || event.eventCategory || 'unknown',
      event_outcome: event.eventOutcome || 'unknown',
      event_action: event.eventAction || 'unknown',
      is_threat: 0, // Not available in new backend
    })) || [],
    total_count: response.data.total || 0,
    has_more: response.data.hasMore || false,
    next_cursor: response.data.nextCursor,
    previous_cursor: response.data.previousCursor,
  };

  return transformedData;
};

/**
 * API function to get event count
 */
export const getEventCount = async (params: EventCountParams): Promise<{ total_count: number }> => {
  const { accessToken } = useAuthStore.getState();
  
  // Build query parameters
  const queryParams = new URLSearchParams();
  if (params.query) queryParams.append('search', params.query);
  if (params.startTime) queryParams.append('start_time', params.startTime.toString());
  if (params.endTime) queryParams.append('end_time', params.endTime.toString());
  if (params.sourceIp) queryParams.append('source_ip', params.sourceIp);
  if (params.eventCategory) queryParams.append('event_category', params.eventCategory);
  if (params.eventOutcome) queryParams.append('event_outcome', params.eventOutcome);
  if (params.eventAction) queryParams.append('event_action', params.eventAction);
  if (params.sourceType) queryParams.append('source_type', params.sourceType);

  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await axios.get(
    `${import.meta.env.VITE_API_BASE || 'http://localhost:8084'}/api/v1/events/count?${queryParams.toString()}`,
    { headers }
  );

  return response.data;
};

/**
 * Hook to create EventSource for real-time event streaming
 */
export const useEventStream = (params: EventStreamParams) => {
  const { accessToken } = useAuthStore.getState();
  
  const createEventSource = useCallback(() => {
    const queryParams = new URLSearchParams();
    if (accessToken) {
      queryParams.append('token', accessToken);
    }
    
    const url = `${import.meta.env.VITE_API_BASE || 'http://localhost:8084'}/api/v1/events/stream?${queryParams.toString()}`;
    return new EventSource(url);
  }, [accessToken, params.tenantId]);

  return { createEventSource };
};

/**
 * Custom hook to fetch events with SWR
 */
export function useEvents(params: EventsParams = {}) {
  const { data, error, isLoading, mutate } = useSWR<EventSearchResponse>(
    ['events', params],
    () => getEvents(params),
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true,
      errorRetryCount: 3,
    }
  );

  return {
    events: data?.events || [],
    totalCount: data?.total_count || 0,
    hasMore: data?.has_more || false,
    nextCursor: data?.next_cursor,
    previousCursor: data?.previous_cursor,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Custom hook to fetch event count with SWR
 */
export function useEventCount(params: EventCountParams = {}) {
  const { data, error, isLoading, mutate } = useSWR<{ total_count: number }>(
    ['event-count', params],
    () => getEventCount(params),
    {
      refreshInterval: 60000, // Refresh every minute
      revalidateOnFocus: true,
      errorRetryCount: 3,
    }
  );

  return {
    totalCount: data?.total_count || 0,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch a single event by ID
 */
export function useEvent(eventId: string | null) {
  const { data, error, isLoading } = useSWR<EventSearchResponse>(
    eventId ? ['event', eventId] : null,
    () => getEvents({ query: `event_id:${eventId}`, limit: 1 }),
    {
      revalidateOnFocus: false,
      errorRetryCount: 3,
    }
  );

  return {
    event: data?.events?.[0] || null,
    isLoading,
    error,
  };
}