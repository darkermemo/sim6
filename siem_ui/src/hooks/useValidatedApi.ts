import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  validateApiResponse,
  ValidationError,
  AlertsResponseSchema,
  RulesResponseSchema,
  AssetsResponseSchema,
  CasesResponseSchema,
  DashboardResponseSchema,
  SearchResponseSchema,
  AuthTokensSchema,
  UserProfileSchema
} from '../schemas/api-validation';

/**
 * Enhanced API hooks with automatic Zod validation
 * Catches data structure mismatches and provides detailed error reporting
 */

interface ApiConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

const defaultConfig: ApiConfig = {
  baseUrl: `${import.meta.env.VITE_API_BASE}/api/v1`,
  timeout: 10000,
  retries: 3
};

/**
 * Generic validated fetch function
 * Automatically validates response against provided Zod schema
 */
async function validatedFetch<T>(
  url: string,
  schema: z.ZodSchema<T>,
  options: RequestInit = {},
  config: ApiConfig = defaultConfig
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(`${config.baseUrl}${url}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Validate response data against schema
    return validateApiResponse(data, schema, `${options.method || 'GET'} ${url}`);
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof ValidationError) {
      // Log validation errors for debugging
      console.error('API Validation Failed:', {
        url,
        error: error.message,
        zodError: error.zodError
      });
      
      // Show user-friendly error message
      toast.error('Data validation error', {
        description: 'The server response format is invalid. Please try again or contact support.'
      });
    }
    
    throw error;
  }
}

/**
 * Safe validated fetch that doesn't throw on validation errors
 * Returns result object with success/error status
 */
async function safeValidatedFetch<T>(
  url: string,
  schema: z.ZodSchema<T>,
  options: RequestInit = {},
  config: ApiConfig = defaultConfig
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await validatedFetch(url, schema, options, config);
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return { success: false, error: errorMessage };
  }
}

/**
 * Validated query hook with automatic error handling
 */
export function useValidatedQuery<T>(
  queryKey: string[],
  url: string,
  schema: z.ZodSchema<T>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey,
    queryFn: () => validatedFetch(url, schema),
    ...options
  });
}

/**
 * Validated mutation hook with automatic error handling
 */
export function useValidatedMutation<TData, TVariables>(
  url: string,
  schema: z.ZodSchema<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>
) {
  return useMutation({
    mutationFn: (variables: TVariables) => {
      const requestOptions: RequestInit = {
        method: 'POST',
        body: JSON.stringify(variables)
      };
      return validatedFetch(url, schema, requestOptions);
    },
    ...options,
    onError: (error: any) => {
      if (!(error instanceof ValidationError)) {
        toast.error('API Error', {
          description: error instanceof Error ? error.message : 'An unexpected error occurred'
        });
      }
      options?.onError?.(error, {} as TVariables, undefined);
    }
  });
}

/**
 * Specific validated hooks for SIEM API endpoints
 */

// Dashboard hooks
export function useDashboardData(options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>) {
  return useValidatedQuery(
    ['dashboard'],
    '/dashboard',
    DashboardResponseSchema,
    {
      staleTime: 30000, // 30 seconds
      refetchInterval: 60000, // 1 minute
      ...options
    }
  );
}

// Alerts hooks
export function useAlerts(params?: Record<string, string>, options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>) {
  const queryParams = params ? `?${new URLSearchParams(params).toString()}` : '';
  
  return useValidatedQuery(
    ['alerts', JSON.stringify(params || {})],
    `/alerts${queryParams}`,
    AlertsResponseSchema,
    {
      staleTime: 10000, // 10 seconds
      ...options
    }
  );
}

export function useCreateAlert() {
  return useValidatedMutation(
    '/alerts',
    AlertsResponseSchema,
    {
      onSuccess: () => {
        toast.success('Alert created successfully');
      }
    }
  );
}

// Rules hooks
export function useRules(params?: Record<string, string>, options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>) {
  const queryParams = params ? `?${new URLSearchParams(params).toString()}` : '';
  
  return useValidatedQuery(
    ['rules', JSON.stringify(params || {})],
    `/rules${queryParams}`,
    RulesResponseSchema,
    {
      staleTime: 60000, // 1 minute
      ...options
    }
  );
}

export function useUpdateRule() {
  return useValidatedMutation(
    '/rules',
    RulesResponseSchema,
    {
      onSuccess: () => {
        toast.success('Rule updated successfully');
      }
    }
  );
}

// Assets hooks
export function useAssets(params?: Record<string, string>, options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>) {
  const queryParams = params ? `?${new URLSearchParams(params).toString()}` : '';
  
  return useValidatedQuery(
    ['assets', JSON.stringify(params || {})],
    `/assets${queryParams}`,
    AssetsResponseSchema,
    {
      staleTime: 300000, // 5 minutes
      ...options
    }
  );
}

// Cases hooks
export function useCases(params?: Record<string, string>, options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>) {
  const queryParams = params ? `?${new URLSearchParams(params).toString()}` : '';
  
  return useValidatedQuery(
    ['cases', JSON.stringify(params || {})],
    `/cases${queryParams}`,
    CasesResponseSchema,
    {
      staleTime: 30000, // 30 seconds
      ...options
    }
  );
}

export function useCreateCase() {
  return useValidatedMutation(
    '/cases',
    CasesResponseSchema,
    {
      onSuccess: () => {
        toast.success('Case created successfully');
      }
    }
  );
}

// Search hooks
export function useSearch(query: string, options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>) {
  return useValidatedQuery(
    ['search', query],
    `/search?q=${encodeURIComponent(query)}`,
    SearchResponseSchema,
    {
      enabled: query.length > 2, // Only search if query is meaningful
      staleTime: 30000,
      ...options
    }
  );
}

// Authentication hooks
export function useLogin() {
  return useValidatedMutation(
    '/auth/login',
    AuthTokensSchema,
    {
      onSuccess: () => {
        toast.success('Login successful');
      }
    }
  );
}

export function useUserProfile(options?: Omit<UseQueryOptions, 'queryKey' | 'queryFn'>) {
  return useValidatedQuery(
    ['user-profile'],
    '/auth/profile',
    UserProfileSchema,
    {
      staleTime: 300000, // 5 minutes
      ...options
    }
  );
}

/**
 * Development helper: Test API validation
 * Only available in development mode
 */
export function useApiValidationTest() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('API validation test is only available in development mode');
  }

  return {
    testValidation: async (endpoint: string, expectedSchema: z.ZodSchema) => {
      try {
        const result = await safeValidatedFetch(endpoint, expectedSchema);
        
        if (result.success) {
          console.log('✅ Validation passed for', endpoint);
          return { success: true, data: result.data };
        } else {
          console.error('❌ Validation failed for', endpoint, result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        console.error('❌ Request failed for', endpoint, error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    },
    
    testAllEndpoints: async () => {
      const endpoints = [
        { url: '/dashboard', schema: DashboardResponseSchema },
        { url: '/alerts', schema: AlertsResponseSchema },
        { url: '/rules', schema: RulesResponseSchema },
        { url: '/assets', schema: AssetsResponseSchema },
        { url: '/cases', schema: CasesResponseSchema }
      ];
      
      const results = await Promise.allSettled(
        endpoints.map(({ url, schema }) => 
          safeValidatedFetch(url, schema)
        )
      );
      
      results.forEach((result, index) => {
        const endpoint = endpoints[index];
        if (result.status === 'fulfilled' && result.value.success) {
          console.log(`✅ ${endpoint.url} validation passed`);
        } else {
          const errorMsg = result.status === 'fulfilled' && !result.value.success 
            ? result.value.error 
            : result.status === 'rejected' ? result.reason : 'Unknown error';
          console.error(`❌ ${endpoint.url} validation failed:`, errorMsg);
        }
      });
      
      return results;
    }
  };
}

/**
 * Export validation utilities for manual use
 */
export {
  validatedFetch,
  safeValidatedFetch,
  ValidationError
};