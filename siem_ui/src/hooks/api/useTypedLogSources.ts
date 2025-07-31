/**
 * Type-safe React hooks for Log Source management using generated OpenAPI types
 * Replaces the existing useLogSources hook with full type safety
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { typedLogSourceApi } from '@/services/typedApi';
import type {
  LogSource,
  LogSourceListResponse,
  CreateLogSourceRequest,
  CreateLogSourceResponse,
} from '@/services/typedApi';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/useToast';

/**
 * Query keys for React Query cache management
 */
export const logSourceQueryKeys = {
  all: ['logSources'] as const,
  lists: () => [...logSourceQueryKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...logSourceQueryKeys.lists(), filters] as const,
  details: () => [...logSourceQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...logSourceQueryKeys.details(), id] as const,
  cache: () => [...logSourceQueryKeys.all, 'cache'] as const,
  byIp: (ip: string) => [...logSourceQueryKeys.all, 'byIp', ip] as const,
};

/**
 * Hook to fetch all log sources with type safety
 */
export function useTypedLogSources() {
  const { accessToken } = useAuthStore();
  const isAuthenticated = !!accessToken;

  return useQuery({
    queryKey: logSourceQueryKeys.list(),
    queryFn: async (): Promise<LogSourceListResponse> => {
      return await typedLogSourceApi.list();
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error: any) => {
      // Don't retry on 403 (forbidden) errors
      if (error?.response?.status === 403) {
        return false;
      }
      return failureCount < 3;
    },
  });
}

/**
 * Hook to create a new log source
 */
export function useCreateLogSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateLogSourceRequest): Promise<CreateLogSourceResponse> => {
      return await typedLogSourceApi.create(data);
    },
    onSuccess: (data) => {
      // Invalidate and refetch log sources list
      queryClient.invalidateQueries({ queryKey: logSourceQueryKeys.lists() });
      
      toast({
        title: 'Log Source Created',
        description: `Successfully created log source: ${data.source_id}`,
        variant: 'success',
      });
    },
    onError: (error: any) => {
      console.error('Failed to create log source:', error);
      
      const errorMessage = error?.response?.data?.message || 
                          error?.message || 
                          'Failed to create log source';
      
      toast({
        title: 'Creation Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to delete a log source
 */
export function useDeleteLogSource() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sourceId: string): Promise<void> => {
      return await typedLogSourceApi.delete(sourceId);
    },
    onSuccess: (_, sourceId) => {
      // Invalidate and refetch log sources list
      queryClient.invalidateQueries({ queryKey: logSourceQueryKeys.lists() });
      
      // Remove the specific log source from cache
      queryClient.removeQueries({ queryKey: logSourceQueryKeys.detail(sourceId) });
      
      toast({
        title: 'Log Source Deleted',
        description: 'Log source has been successfully deleted',
        variant: 'success',
      });
    },
    onError: (error: any) => {
      console.error('Failed to delete log source:', error);
      
      const errorMessage = error?.response?.data?.message || 
                          error?.message || 
                          'Failed to delete log source';
      
      toast({
        title: 'Deletion Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to get log source by IP address
 */
export function useLogSourceByIp(ip: string, enabled = true) {
  return useQuery({
    queryKey: logSourceQueryKeys.byIp(ip),
    queryFn: async () => {
      return await typedLogSourceApi.getByIp(ip);
    },
    enabled: enabled && !!ip,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error: any) => {
      // Don't retry on 404 (not found) errors
      if (error?.response?.status === 404) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

/**
 * Hook to get log sources cache
 */
export function useLogSourcesCache() {
  return useQuery({
    queryKey: logSourceQueryKeys.cache(),
    queryFn: async () => {
      return await typedLogSourceApi.getCache();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 2,
  });
}

/**
 * Utility function to get log source type badge variant
 * Moved from the original hook for consistency
 */
export function getLogSourceTypeBadgeVariant(sourceType?: string) {
  switch (sourceType) {
    case 'Syslog':
      return 'default';
    case 'JSON':
      return 'secondary';
    case 'Windows':
      return 'outline';
    case 'Apache':
      return 'destructive';
    case 'Nginx':
      return 'success';
    default:
      return 'default';
  }
}

/**
 * Utility function to get valid log source types
 * Moved from the original hook for consistency
 */
export function getValidLogSourceTypes(): string[] {
  return ['Syslog', 'JSON', 'Windows', 'Apache', 'Nginx'];
}

/**
 * Export types for convenience
 */
export type { LogSource, CreateLogSourceRequest, CreateLogSourceResponse, LogSourceListResponse };