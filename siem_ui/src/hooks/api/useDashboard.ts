import useSWR from 'swr';
import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { dashboardApi } from '@/services/api';
import type { DashboardResponse, DashboardFilters } from '@/types/api';

/**
 * Hook to fetch dashboard data with SWR
 * Provides loading, error, and data states
 * 
 * Critical Quality Gate Rule 3: Infinite Loop Prevention
 * Critical Quality Gate Rule 4: Security-First Development
 */
export function useDashboard(filters: DashboardFilters) {
  const { isAuthenticated, accessToken } = useAuthStore();

  // Stabilize the key to prevent infinite re-renders
  const key = useMemo(() => ['dashboard', filters], [
    filters.from,
    filters.to, 
    filters.severity,
    filters.page,
    filters.limit
  ]);

  // Prevent API calls when not authenticated to stop infinite loops
  const shouldFetch = isAuthenticated && accessToken;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<DashboardResponse>(
    shouldFetch ? key : null,  // Conditional fetching prevents infinite loops
    shouldFetch ? () => dashboardApi.getDashboard(filters) : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: shouldFetch ? 30000 : 0, // Only refresh when authenticated
      errorRetryCount: shouldFetch ? 2 : 0, // Reduced retry count to prevent infinite loops
      errorRetryInterval: 10000, // Increased interval to reduce cascade failures
      shouldRetryOnError: (error) => {
        // Don't retry on authentication errors to prevent infinite loops
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          return false;
        }
        return true;
      },
      onError: (error) => {
        // Log error but don't throw to prevent cascade failures
        console.error('Dashboard API error:', error);
        
        // Clear auth on 401/403 to prevent infinite retries
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          const { clearTokens } = useAuthStore.getState();
          clearTokens();
        }
      },
    }
  );

  return {
    /** Dashboard data from API */
    data,
    /** Loading state - true during initial load */
    isLoading: shouldFetch ? isLoading : false,
    /** Validating state - true during background refresh */
    isValidating: shouldFetch ? isValidating : false,
    /** Error object if request failed */
    error: shouldFetch ? error : null,
    /** Whether data is empty/null */
    isEmpty: !data,
    /** Manual refresh function */
    refresh: shouldFetch ? mutate : () => Promise.resolve(),
    /** Whether currently refreshing */
    isRefreshing: shouldFetch ? (isValidating && !!data) : false,
    /** Whether user is authenticated */
    isAuthenticated: shouldFetch,
  };
}

/**
 * Hook for optimistic updates to dashboard data
 * Allows updating local state before API response
 */
export function useDashboardMutation() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const { mutate } = useSWR(['dashboard']);

  /**
   * Optimistically update dashboard data
   */
  const updateDashboard = async (
    updater: (data: DashboardResponse) => DashboardResponse,
    options?: { revalidate?: boolean }
  ) => {
    // Prevent mutations when not authenticated
    if (!isAuthenticated || !accessToken) {
      console.warn('Cannot update dashboard: user not authenticated');
      return;
    }

    try {
      await mutate(updater, { revalidate: options?.revalidate ?? true });
    } catch (error) {
      console.error('Dashboard mutation error:', error);
      // Don't throw to prevent cascade failures
    }
  };

  return {
    updateDashboard,
    isAuthenticated,
  };
} 