import { useDashboardV2 } from './api/useDashboardV2';
import { useAsset, useAssets } from './api/useAsset';
import { useUpdateAlertStatus, useBatchUpdateAlertStatus } from './api/useUpdateAlertStatus';

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
       * Fetch dashboard data (V2 API)
       */
      useDashboardV2: () => useDashboardV2(),
    },

    /**
     * Asset API methods
     */
    assets: {
      /**
       * Fetch single asset by IP (with debouncing)
       */
      useAsset: (ip: string | null) => useAsset(ip),
      
      /**
       * Fetch multiple assets by IP
       */
      useAssets: (ips: string[]) => useAssets(ips),
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
 * Hook for dashboard operations (V2 API)
 */
export function useDashboardApi() {
  return useDashboardV2();
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
export function useAssetApi(ip: string | null) {
  return useAsset(ip);
}