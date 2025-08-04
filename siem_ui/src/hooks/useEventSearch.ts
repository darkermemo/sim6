import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { useAuth } from './useAuth';
import {
  EventSearchResponse,
  EventDetailResponse,
  TimeRange,
  Pagination,
  SortField,
  FilterValue,
  SearchOptions,
} from '../types/api';

interface UseEventSearchParams {
  timeRange?: TimeRange;
  freeText?: string;
  filters?: FilterValue[];
  pagination?: Pagination;
  sort?: SortField;
  searchOptions?: SearchOptions;
  enabled?: boolean;
}

interface UseEventSearchResult {
  data: EventSearchResponse | undefined;
  events: EventDetailResponse[];
  totalCount: number;
  hasMore: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8084';

export const useEventSearch = (params: UseEventSearchParams): UseEventSearchResult => {
  const { accessToken } = useAuthStore();
  const { token } = useAuth();
  
  const {
    timeRange,
    freeText,
    filters,
    pagination = { page: 1, size: 50, includeTotal: true },
    sort = { field: 'event_timestamp', direction: 'desc' },
    searchOptions,
    enabled = true,
  } = params;

  const queryKey = [
    'events-search',
    timeRange,
    freeText,
    filters,
    pagination,
    sort,
    searchOptions,
  ];

  const queryFn = async (): Promise<EventSearchResponse> => {
    // Build query parameters for GET request
    const params = new URLSearchParams();
    
    // Add tenant ID (required)
    params.append('tenantId', 'default'); // TODO: Get from auth context
    
    // Add pagination
    if (pagination?.page) {
      params.append('page', pagination.page.toString());
    }
    if (pagination?.size) {
      params.append('limit', pagination.size.toString());
    }
    
    // Add search text
    if (freeText) {
      params.append('search', freeText);
    }
    
    // Add time range
    if (timeRange?.start) {
      params.append('startTime', new Date(timeRange.start).toISOString());
    }
    if (timeRange?.end) {
      params.append('endTime', new Date(timeRange.end).toISOString());
    }
    
    // Add filters as custom filter parameters
    if (filters && filters.length > 0) {
      filters.forEach((filter) => {
        if (typeof filter === 'object' && 'field' in filter && 'value' in filter) {
          params.append(`filters[${filter.field}]`, String(filter.value));
        }
      });
    }

    const headers: Record<string, string> = {};

    // Add auth header if token is available
    const authToken = accessToken || token;
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE}/api/v1/events/search?${params.toString()}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Search failed: ${response.status} ${errorText}`);
    }

    const rawData = await response.json();
    
    // Transform the PagedEvents response to match EventSearchResponse format
     const transformedData: EventSearchResponse = {
       events: rawData.events?.map((event: any) => ({
         id: event.eventId || event.event_id || '',
         timestamp: new Date(event.eventTimestamp * 1000).toISOString(),
         source: event.sourceType || 'unknown',
         sourceType: event.sourceType || 'unknown',
         severity: event.severity || 'info',
         facility: 'unknown',
         hostname: 'unknown',
         process: 'unknown',
         message: event.message || '',
         rawMessage: event.message || '',
         sourceIp: event.sourceIp || '',
         sourcePort: 0,
         protocol: 'unknown',
         tags: [],
         fields: {},
         processingStage: 'processed',
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString(),
       })) || [],
       total: rawData.total || 0,
       status: 'success',
     };
    
    return transformedData;
  };

  const query: UseQueryResult<EventSearchResponse, Error> = useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error.message.includes('4')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    data: query.data,
    events: query.data?.events || [],
    totalCount: query.data?.total || 0,
    hasMore: (query.data?.events?.length || 0) >= pagination.size,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};