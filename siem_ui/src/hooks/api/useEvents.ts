import useSWR from 'swr';
import { useCallback } from 'react';
import { EventSearchRequest, EventSearchResponse } from '../../types/events';
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
 * API function to search events
 */
export const getEvents = async (params: EventsParams): Promise<EventSearchResponse> => {
  const { accessToken } = useAuthStore.getState();
  
  // Build search request
  const searchRequest: EventSearchRequest = {
    time_range: params.startTime && params.endTime ? {
      start_unix: params.startTime,
      end_unix: params.endTime
    } : undefined,
    free_text: params.query || undefined,
    filters: [],
    sort: {
      field: 'event_timestamp',
      direction: 'desc'
    },
    limit: params.limit || 50,
    offset: ((params.page || 1) - 1) * (params.limit || 50)
  };

  // Add structured filters
  if (params.sourceIp) {
    searchRequest.filters?.push({
      field: 'source_ip',
      operator: '=',
      value: params.sourceIp
    });
  }
  if (params.eventCategory) {
    searchRequest.filters?.push({
      field: 'event_category',
      operator: '=',
      value: params.eventCategory
    });
  }
  if (params.eventOutcome) {
    searchRequest.filters?.push({
      field: 'event_outcome',
      operator: '=',
      value: params.eventOutcome
    });
  }
  if (params.eventAction) {
    searchRequest.filters?.push({
      field: 'event_action',
      operator: '=',
      value: params.eventAction
    });
  }
  if (params.sourceType) {
    searchRequest.filters?.push({
      field: 'source_type',
      operator: '=',
      value: params.sourceType
    });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await axios.post(
    `${import.meta.env.VITE_API_BASE || 'http://localhost:8080'}/api/v1/events/search`,
    searchRequest,
    { headers }
  );

  return response.data;
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
    `${import.meta.env.VITE_API_BASE || 'http://localhost:8080'}/api/v1/events/count?${queryParams.toString()}`,
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
    
    const url = `${import.meta.env.VITE_API_BASE || 'http://localhost:8080'}/api/v1/events/stream?${queryParams.toString()}`;
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