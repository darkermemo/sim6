import useSWR from 'swr';
import { useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { logSourceApi } from '@/services/api';
import { useToast } from '@/hooks/useToast';
import type { 
  LogSource, 
  LogSourceListResponse, 
  CreateLogSourceRequest, 
  LogSourceFilters,
  LogSourceType
} from '@/types/api';

/**
 * Hook for managing log sources with conditional fetching and CRUD operations
 * Requires Admin role for all operations
 */
export function useLogSources(filters?: LogSourceFilters) {
  const { isAuthenticated, accessToken } = useAuthStore();
  
  // Stabilize SWR key to prevent infinite re-renders
  const key = useMemo(() => {
    return filters ? [`/api/v1/log_sources`, JSON.stringify(filters)] : '/api/v1/log_sources';
  }, [filters?.page, filters?.limit, filters?.search, filters?.source_type]);

  // Only fetch if authenticated (prevents 401 cascade failures)
  const shouldFetch = isAuthenticated && accessToken;

  const { data, error, isLoading, mutate } = useSWR<LogSourceListResponse>(
    shouldFetch ? key : null,
    shouldFetch ? () => logSourceApi.getLogSources(filters) : null,
    {
      refreshInterval: shouldFetch ? 30000 : 0, // Refresh every 30 seconds if authenticated
      errorRetryCount: shouldFetch ? 2 : 0,
      errorRetryInterval: 10000,
      shouldRetryOnError: (error) => {
        // Don't retry on auth errors (prevents infinite loops)
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          return false;
        }
        return true;
      },
      onError: (error) => {
        console.error('Log sources API error:', error);
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          const { clearTokens } = useAuthStore.getState();
          clearTokens();
        }
      },
    }
  );

  const logSources = data?.log_sources || [];
  const total = data?.total || 0;

  return {
    logSources,
    total,
    isLoading,
    error,
    mutate,
    isAuthenticated: shouldFetch,
  };
}

/**
 * Hook for creating log sources
 */
export function useCreateLogSource() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);

  const createLogSource = async (logSourceData: CreateLogSourceRequest): Promise<LogSource | null> => {
    if (!isAuthenticated || !accessToken) {
      throw new Error('Authentication required');
    }

    setIsCreating(true);
    try {
      const response = await logSourceApi.createLogSource(logSourceData);
      
      toast({
        title: 'Log Source Created',
        description: `Log source "${logSourceData.source_name}" has been created successfully.`,
        variant: 'default',
      });

      return {
        source_id: response.source_id,
        tenant_id: '', // Will be filled by backend
        source_name: logSourceData.source_name,
        source_type: logSourceData.source_type,
        source_ip: logSourceData.source_ip,
        created_at: Math.floor(Date.now() / 1000),
      };
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to create log source';
      toast({
        title: 'Error Creating Log Source',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    createLogSource,
    isCreating,
  };
}

/**
 * Hook for deleting log sources
 */
export function useDeleteLogSource() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteLogSource = async (sourceId: string, sourceName: string): Promise<void> => {
    if (!isAuthenticated || !accessToken) {
      throw new Error('Authentication required');
    }

    setIsDeleting(true);
    try {
      await logSourceApi.deleteLogSource(sourceId);
      
      toast({
        title: 'Log Source Deleted',
        description: `Log source "${sourceName}" has been deleted successfully.`,
        variant: 'default',
      });
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error || 'Failed to delete log source';
      toast({
        title: 'Error Deleting Log Source',
        description: errorMessage,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteLogSource,
    isDeleting,
  };
}

/**
 * Hook for log source lookup by IP (internal use)
 */
export function useLogSourceLookup() {
  const lookupByIp = async (ip: string) => {
    try {
      return await logSourceApi.getLogSourceByIp(ip);
    } catch (error) {
      console.error('Log source lookup error:', error);
      throw error;
    }
  };

  return {
    lookupByIp,
  };
}

/**
 * Utility function to get log source type badge variant
 */
export function getLogSourceTypeBadgeVariant(sourceType: LogSourceType): 'default' | 'secondary' | 'outline' | 'success' {
  switch (sourceType) {
    case 'Syslog':
      return 'default';
    case 'JSON':
      return 'secondary';
    case 'Windows':
      return 'outline';
    case 'Apache':
      return 'success';
    case 'Nginx':
      return 'success';
    default:
      return 'outline';
  }
}

/**
 * Utility function to get valid log source types
 */
export function getValidLogSourceTypes(): LogSourceType[] {
  return ['Syslog', 'JSON', 'Windows', 'Apache', 'Nginx'];
} 