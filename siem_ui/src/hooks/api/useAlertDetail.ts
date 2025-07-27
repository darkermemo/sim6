import useSWR from 'swr';
import { apiClient } from '@/services/api';
import type { AlertDetail } from '@/types/api';

/**
 * Hook to fetch detailed alert information
 * Uses SWR for caching and automatic revalidation
 */
export function useAlertDetail(alertId: string | null) {
  const key = alertId ? ['alert', alertId] : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<AlertDetail>(
    alertId ? key : null,
    () => fetchAlertDetail(alertId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  return {
    /** Alert detail data from API */
    data,
    /** Loading state - true during initial load */
    isLoading,
    /** Validating state - true during background refresh */
    isValidating,
    /** Error object if request failed */
    error,
    /** Whether data is empty/null */
    isEmpty: !data,
    /** Manual refresh function */
    refresh: mutate,
    /** Whether currently refreshing */
    isRefreshing: isValidating && !!data,
  };
}

/**
 * Fetch alert detail from API
 */
async function fetchAlertDetail(alertId: string): Promise<AlertDetail> {
  const response = await apiClient.get(`/api/v1/alerts/${alertId}`);
  return response.data;
} 