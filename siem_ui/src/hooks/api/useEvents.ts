import useSWR from 'swr';
import { Event, EventsList, EventsListSchema, EventFilters } from '../../schemas/events-validation';
import { validatedFetch } from '../useValidatedApi';

/**
 * Custom hook to fetch events from ClickHouse
 * @param filters - Optional filters for the events query
 * @returns SWR response with events data
 */
export function useEvents(filters?: EventFilters) {
  // Build query parameters
  const params = new URLSearchParams();
  if (filters?.page) params.append('page', filters.page.toString());
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.search) params.append('search', filters.search);
  if (filters?.severity) params.append('severity', filters.severity);
  if (filters?.source_type) params.append('source_type', filters.source_type);
  if (filters?.start_time) params.append('start_time', filters.start_time.toString());
  if (filters?.end_time) params.append('end_time', filters.end_time.toString());

  const queryString = params.toString();
  const url = `/api/v1/events${queryString ? `?${queryString}` : ''}`;

  const { data, error, isLoading, mutate } = useSWR<EventsList>(
    url,
    async (url: string) => {
      const response = await validatedFetch(url, EventsListSchema);
      return response;
    },
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true,
      errorRetryCount: 3,
    }
  );

  return {
    events: data || [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch a single event by ID
 * @param eventId - The event ID to fetch
 * @returns SWR response with single event data
 */
export function useEvent(eventId: string | null) {
  const { data, error, isLoading } = useSWR<Event>(
    eventId ? `/api/v1/events/${eventId}` : null,
    async (url: string) => {
      const response = await validatedFetch(url, EventsListSchema);
      return response[0]; // Return first event
    }
  );

  return {
    event: data,
    isLoading,
    error,
  };
}