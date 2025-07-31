import useSWR from 'swr';
import { useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { validatedFetch } from '../useValidatedApi';
import { RoutingRuleSchema, type RoutingRule } from '@/schemas/api-validation';
import { z } from 'zod';
import type { RuleFilters } from '@/types/api';

// Additional Zod schemas for rule operations
const CreateRuleRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  condition: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  enabled: z.boolean().default(true),
});

const UpdateRuleRequestSchema = CreateRuleRequestSchema.partial();

const CreateSigmaRuleResponseSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
});

type CreateRuleRequest = z.infer<typeof CreateRuleRequestSchema>;
type UpdateRuleRequest = z.infer<typeof UpdateRuleRequestSchema>;
type CreateSigmaRuleResponse = z.infer<typeof CreateSigmaRuleResponseSchema>;
type Rule = RoutingRule; // Use RoutingRule as the base Rule type

const RulesListSchema = z.array(RoutingRuleSchema);

/**
 * Hook to fetch all rules with optional filtering
 * Uses validatedFetch with Zod validation and corrected API base URL
 * 
 * Critical Quality Gate Rule 3: Infinite Loop Prevention
 * Critical Quality Gate Rule 4: Security-First Development
 */
export function useRules(filters?: RuleFilters) {
  const { isAuthenticated, accessToken } = useAuthStore();

  // Stabilize the SWR key to prevent infinite re-renders
  const key = useMemo(() => {
    return filters ? [`/routing-rules`, JSON.stringify(filters)] : '/routing-rules';
  }, [
    filters?.page,
    filters?.limit,
    filters?.search,
    filters?.is_active
  ]);

  // Prevent API calls when not authenticated to stop infinite loops
  const shouldFetch = isAuthenticated && accessToken;

  const { data, error, isLoading, mutate } = useSWR(
    shouldFetch ? key : null, // Conditional fetching prevents infinite loops
    shouldFetch ? () => fetchRulesWithValidation(filters, accessToken) : null,
    {
      refreshInterval: shouldFetch ? 30000 : 0, // Only refresh when authenticated
      revalidateOnFocus: shouldFetch ? true : false,
      errorRetryCount: shouldFetch ? 2 : 0, // Reduced retry count
      errorRetryInterval: 10000,
      shouldRetryOnError: (error) => {
        // Don't retry on authentication errors
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          return false;
        }
        return true;
      },
      onError: (error) => {
        console.error('Rules API error:', error);
        
        // Clear auth on 401/403 to prevent infinite retries
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          const { clearTokens } = useAuthStore.getState();
          clearTokens();
        }
      },
    }
  );

  return {
    rules: shouldFetch ? (data || []) : [],
    total: shouldFetch ? (data?.length || 0) : 0,
    isLoading: shouldFetch ? isLoading : false,
    error: shouldFetch ? error : null,
    refresh: shouldFetch ? mutate : () => Promise.resolve(),
    isAuthenticated: shouldFetch,
  };
}

/**
 * Fetch rules from API with Zod validation
 * Uses the updated VITE_API_BASE environment variable
 */
async function fetchRulesWithValidation(filters?: RuleFilters, token?: string): Promise<RoutingRule[]> {
  const params = new URLSearchParams();
  if (filters?.page) params.append('page', filters.page.toString());
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.search) params.append('search', filters.search);
  if (filters?.is_active !== undefined) params.append('is_active', filters.is_active.toString());
  
  const url = `/routing-rules${params.toString() ? `?${params.toString()}` : ''}`;
  
  return validatedFetch(
    url,
    RulesListSchema,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );
}

/**
 * Hook for fetching a single rule by ID
 */
export function useRule(ruleId: string | null) {
  const { isAuthenticated, accessToken } = useAuthStore();
  const shouldFetch = isAuthenticated && accessToken && ruleId;

  const { data, error, isLoading, mutate } = useSWR(
    shouldFetch ? ['rule', ruleId] : null,
    shouldFetch ? () => fetchSingleRule(ruleId!, accessToken!) : null,
    {
      revalidateOnFocus: false,
      errorRetryCount: shouldFetch ? 2 : 0,
      shouldRetryOnError: (error) => {
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          return false;
        }
        return true;
      },
    }
  );

  return {
    rule: data,
    isLoading: shouldFetch ? isLoading : false,
    error: shouldFetch ? error : null,
    refresh: shouldFetch ? mutate : () => Promise.resolve(),
    isAuthenticated: shouldFetch,
  };
}

/**
 * Hook for creating rules
 */
export function useCreateRule() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createRule = async (ruleData: CreateRuleRequest): Promise<Rule> => {
    if (!isAuthenticated || !accessToken) {
      throw new Error('Authentication required');
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const result = await createRuleWithValidation(ruleData, accessToken);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create rule');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { createRule, isLoading, error, isAuthenticated };
}

/**
 * Hook for creating Sigma rules
 */
export function useCreateSigmaRule() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createSigmaRule = async (sigmaYaml: string): Promise<CreateSigmaRuleResponse> => {
    if (!isAuthenticated || !accessToken) {
      throw new Error('Authentication required');
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const result = await createSigmaRuleWithValidation(sigmaYaml, accessToken);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create Sigma rule');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { createSigmaRule, isLoading, error, isAuthenticated };
}

/**
 * Hook for updating rules
 */
export function useUpdateRule() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateRule = async (ruleId: string, updates: UpdateRuleRequest): Promise<Rule> => {
    if (!isAuthenticated || !accessToken) {
      throw new Error('Authentication required');
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const result = await updateRuleWithValidation(ruleId, updates, accessToken);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update rule');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateRule, isLoading, error, isAuthenticated };
}

/**
 * Hook for toggling rule status
 */
export function useToggleRule() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const toggleRule = async (ruleId: string, enabled: boolean): Promise<Rule> => {
    if (!isAuthenticated || !accessToken) {
      throw new Error('Authentication required');
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const result = await toggleRuleWithValidation(ruleId, enabled, accessToken);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to toggle rule');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { toggleRule, isLoading, error, isAuthenticated };
}

/**
 * Hook for deleting rules
 */
export function useDeleteRule() {
  const { isAuthenticated, accessToken } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteRule = async (ruleId: string): Promise<void> => {
    if (!isAuthenticated || !accessToken) {
      throw new Error('Authentication required');
    }

    setIsLoading(true);
    setError(null);
    
    try {
      await deleteRuleWithValidation(ruleId, accessToken);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete rule');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteRule, isLoading, error, isAuthenticated };
}

// Helper functions for API calls with validation

async function fetchSingleRule(ruleId: string, token: string): Promise<RoutingRule> {
  return validatedFetch(
    `/routing-rules/${ruleId}`,
    RoutingRuleSchema,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );
}

async function createRuleWithValidation(ruleData: CreateRuleRequest, token: string): Promise<RoutingRule> {
  return validatedFetch(
    '/routing-rules',
    RoutingRuleSchema,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ruleData),
    }
  );
}

async function createSigmaRuleWithValidation(sigmaYaml: string, token: string): Promise<CreateSigmaRuleResponse> {
  return validatedFetch(
    '/routing-rules/sigma',
    CreateSigmaRuleResponseSchema,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sigma_yaml: sigmaYaml }),
    }
  );
}

async function updateRuleWithValidation(ruleId: string, updates: UpdateRuleRequest, token: string): Promise<RoutingRule> {
  return validatedFetch(
    `/routing-rules/${ruleId}`,
    RoutingRuleSchema,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    }
  );
}

async function toggleRuleWithValidation(ruleId: string, enabled: boolean, token: string): Promise<RoutingRule> {
  return validatedFetch(
    `/routing-rules/${ruleId}/toggle`,
    RoutingRuleSchema,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled }),
    }
  );
}

async function deleteRuleWithValidation(ruleId: string, token: string): Promise<void> {
  await validatedFetch(
    `/routing-rules/${ruleId}`,
    z.object({}), // Empty response schema for delete
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );
}