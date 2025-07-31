import useSWR from 'swr';
import { useState } from 'react';
import { validatedFetch } from '../useValidatedApi';
import { useAuthStore } from '../../stores/authStore';
import { useToast } from '../useToast';
import { z } from 'zod';
import type { LogSourceType } from '@/types/api';

// Zod schema for log source
const LogSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.string(),
  subtype: z.string().optional(),
  parser_id: z.string().optional(),
  tenant_id: z.string().optional(),
  status: z.enum(['active', 'degraded', 'inactive']),
  eps: z.number().default(0),
  event_count: z.number().default(0),
  host: z.string().optional(),
  port: z.number().optional(),
  config: z.record(z.string(), z.any()).optional(),
  last_seen: z.union([z.string().datetime(), z.number()]).optional(),
  created_at: z.union([z.string().datetime(), z.number()]),
  updated_at: z.union([z.string().datetime(), z.number()]).optional(),
  // Legacy fields for backward compatibility
  source_id: z.string().optional(),
  source_name: z.string().optional(),
  source_type: z.string().optional(),
  source_ip: z.string().optional(),
}).transform((data) => ({
  id: data.id,
  name: data.name,
  type: data.type,
  subtype: data.subtype || '',
  parser_id: data.parser_id || '',
  tenant_id: data.tenant_id || '',
  status: data.status,
  eps: data.eps,
  event_count: data.event_count,
  host: data.host,
  port: data.port,
  config: data.config,
  last_seen: typeof data.last_seen === 'number' ? data.last_seen : data.last_seen ? new Date(data.last_seen).getTime() : Date.now(),
  created_at: typeof data.created_at === 'number' ? data.created_at : new Date(data.created_at).getTime(),
  updated_at: data.updated_at ? (typeof data.updated_at === 'number' ? data.updated_at : new Date(data.updated_at).getTime()) : undefined,
  // Legacy fields for backward compatibility
  source_id: data.source_id,
  source_name: data.source_name,
  source_type: data.source_type,
  source_ip: data.source_ip,
}));

const LogSourcesListSchema = z.array(LogSourceSchema);

const CreateLogSourceRequestSchema = z.object({
  name: z.string(),
  type: z.string(),
  host: z.string().optional(),
  port: z.number().optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export type LogSource = z.infer<typeof LogSourceSchema>;
export type CreateLogSourceRequest = z.infer<typeof CreateLogSourceRequestSchema>;

/**
 * Hook to fetch log sources
 * Uses SWR for caching and automatic revalidation with Zod validation
 */
export function useLogSources() {
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<LogSource[]>(
    'log-sources',
    fetchLogSources,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  return {
    /** Log sources array from API */
    logSources: data || [],
    /** Total count */
    total: data?.length || 0,
    /** Loading state - true during initial load */
    isLoading,
    /** Validating state - true during background refresh */
    isValidating,
    /** Error object if request failed */
    error,
    /** Whether data is empty/null */
    isEmpty: !data || data.length === 0,
    /** Manual refresh function */
    mutate,
    /** Whether currently refreshing */
    isRefreshing: isValidating && !!data,
    /** Authentication status */
    isAuthenticated: true,
  };
}

/**
 * Fetch log sources from API with Zod validation
 * Uses the updated VITE_API_BASE environment variable
 */
async function fetchLogSources(): Promise<LogSource[]> {
  const token = localStorage.getItem('access_token');
  return validatedFetch(
    '/log-sources',
    LogSourcesListSchema,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );
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
      const response = await validatedFetch(
          '/log-sources',
          LogSourceSchema,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(logSourceData),
          }
        );
      
      toast({
        title: 'Log Source Created',
        description: `Log source "${logSourceData.name}" has been created successfully.`,
        variant: 'default',
      });

      return {
        id: response.id,
        name: logSourceData.name,
        type: logSourceData.type,
        subtype: '',
        parser_id: '',
        tenant_id: '',
        status: 'active' as const,
        eps: 0,
        event_count: 0,
        host: logSourceData.host,
        port: logSourceData.port,
        config: logSourceData.config,
        last_seen: Date.now(),
        created_at: Date.now(),
        updated_at: undefined,
        // Legacy fields for backward compatibility
        source_id: undefined,
        source_name: undefined,
        source_type: undefined,
        source_ip: undefined,
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
      await validatedFetch(
          `/log-sources/${sourceId}`,
          z.any(),
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
      
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
      const response = await validatedFetch(
          `/log-sources/lookup/${ip}`,
          LogSourceSchema,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
          }
        );
      return response;
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
export function getLogSourceTypeBadgeVariant(sourceType: string): 'default' | 'secondary' | 'outline' | 'success' {
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