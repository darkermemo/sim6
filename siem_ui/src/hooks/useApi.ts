import { useDashboard, useDashboardMutation } from './api/useDashboard';
import { useAsset, useAssets } from './api/useAsset';
import { useUpdateAlertStatus, useBatchUpdateAlertStatus } from './api/useUpdateAlertStatus';
import type { DashboardFilters } from '@/types/api';

/**
 * Central API hook that provides access to all API methods
 * This is the main entry point for API interactions
 */
export function useApi() {
  return {
    /**
     * Dashboard API methods
     */
    dashboard: {
      /**
       * Fetch dashboard data with filters
       */
      useDashboard: (filters: DashboardFilters) => useDashboard(filters),
      
      /**
       * Hook for optimistic dashboard updates
       */
      useMutation: () => useDashboardMutation(),
    },

    /**
     * Asset API methods
     */
    assets: {
      /**
       * Fetch single asset by IP (with debouncing)
       */
      useAsset: (ip: string | null, enabled?: boolean) => useAsset(ip, enabled),
      
      /**
       * Fetch multiple assets by IP
       */
      useAssets: (ips: string[], enabled?: boolean) => useAssets(ips, enabled),
    },

    /**
     * Alert API methods
     */
    alerts: {
      /**
       * Update single alert status
       */
      useUpdateStatus: () => useUpdateAlertStatus(),
      
      /**
       * Batch update alert statuses
       */
      useBatchUpdate: () => useBatchUpdateAlertStatus(),
    },
  };
}

/**
 * Convenience hooks for common operations
 */

/**
 * Hook for dashboard operations
 */
export function useDashboardApi(filters: DashboardFilters) {
  const dashboard = useDashboard(filters);
  const mutation = useDashboardMutation();
  
  return {
    ...dashboard,
    ...mutation,
  };
}

/**
 * Hook for alert operations
 */
export function useAlertApi() {
  const updateStatus = useUpdateAlertStatus();
  const batchUpdate = useBatchUpdateAlertStatus();
  
  return {
    ...updateStatus,
    batchUpdate: batchUpdate.batchUpdateStatus,
    isBatchLoading: batchUpdate.isLoading,
    batchProgress: batchUpdate.progress,
  };
}

/**
 * Hook for asset operations
 */
export function useAssetApi(ip: string | null, enabled?: boolean) {
  return useAsset(ip, enabled);
} 