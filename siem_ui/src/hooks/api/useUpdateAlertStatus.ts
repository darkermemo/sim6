import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { apiClient } from '@/services/api';
import { useToast } from '@/hooks/useToast';
import type { DashboardResponse } from '@/types/api';

/**
 * Hook for updating alert status with optimistic updates
 * Shows toast notifications on success/failure
 */
export function useUpdateAlertStatus() {
  const [isLoading, setIsLoading] = useState(false);
  const { mutate } = useSWRConfig();
  const { toast } = useToast();

  /**
   * Update alert status with optimistic UI updates
   */
  const updateStatus = async (
    alertId: string,
    newStatus: string,
    options?: {
      optimistic?: boolean;
      showToast?: boolean;
    }
  ) => {
    const { optimistic = true, showToast = true } = options || {};

    setIsLoading(true);

    try {
      // Optimistic update - update UI before API call
      if (optimistic) {
        await mutate(
          (key) => Array.isArray(key) && key[0] === 'dashboard',
          (data: DashboardResponse | undefined) => {
            if (!data) return data;

            return {
              ...data,
              recentAlerts: data.recentAlerts.map(alert =>
                alert.id === alertId
                  ? { ...alert, status: newStatus as any }
                  : alert
              ),
            };
          },
          { revalidate: false }
        );
      }

      // Make API call
      const response = await apiClient.patch(`/api/v1/alerts/${alertId}/status`, {
        status: newStatus
      });

      if (response.data) {
        // Revalidate to ensure data consistency
        await mutate((key) => Array.isArray(key) && key[0] === 'dashboard');
        await mutate(['alert', alertId]);

        if (showToast) {
          toast({
            title: 'Alert Updated',
            description: `Alert status changed to ${newStatus}`,
            variant: 'success',
          });
        }

        return response.data;
      } else {
        throw new Error('Failed to update alert status');
      }
    } catch (error) {
      // Revert optimistic update on error
      if (optimistic) {
        await mutate((key) => Array.isArray(key) && key[0] === 'dashboard');
        await mutate(['alert', alertId]);
      }

      if (showToast) {
        toast({
          title: 'Update Failed',
          description: 'Failed to update alert status. Please try again.',
          variant: 'destructive',
        });
      }

      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    /** Update alert status function */
    updateStatus,
    /** Loading state */
    isLoading,
  };
}

/**
 * Hook for batch alert status updates
 * Useful for bulk operations
 */
export function useBatchUpdateAlertStatus() {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { mutate } = useSWRConfig();
  const { toast } = useToast();

  /**
   * Update multiple alert statuses in batch
   */
  const batchUpdateStatus = async (
    updates: Array<{ alertId: string; status: string }>,
    options?: {
      showProgress?: boolean;
      showToast?: boolean;
    }
  ) => {
    const { showProgress = true, showToast = true } = options || {};

    setIsLoading(true);
    setProgress(0);

    const results: Array<{ alertId: string; success: boolean; error?: any }> = [];

    try {
      for (let i = 0; i < updates.length; i++) {
        const { alertId, status } = updates[i];

        try {
          await apiClient.patch(`/api/v1/alerts/${alertId}/status`, { status });
          results.push({ alertId, success: true });
        } catch (error) {
          results.push({ alertId, success: false, error });
        }

        if (showProgress) {
          setProgress(((i + 1) / updates.length) * 100);
        }
      }

      // Revalidate dashboard data after batch update
      await mutate((key) => Array.isArray(key) && key[0] === 'dashboard');

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      if (showToast) {
        if (failureCount === 0) {
          toast({
            title: 'Batch Update Complete',
            description: `Successfully updated ${successCount} alerts`,
            variant: 'success',
          });
        } else {
          toast({
            title: 'Batch Update Partial',
            description: `Updated ${successCount} alerts, ${failureCount} failed`,
            variant: 'default',
          });
        }
      }

      return results;
    } catch (error) {
      if (showToast) {
        toast({
          title: 'Batch Update Failed',
          description: 'Failed to update alerts. Please try again.',
          variant: 'destructive',
        });
      }

      throw error;
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  return {
    /** Batch update function */
    batchUpdateStatus,
    /** Loading state */
    isLoading,
    /** Progress percentage (0-100) */
    progress,
  };
} 