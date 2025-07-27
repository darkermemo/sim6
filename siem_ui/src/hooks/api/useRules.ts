import useSWR from 'swr';
import { useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { rulesApi } from '@/services/api';
import type { Rule, RuleFilters, CreateRuleRequest, UpdateRuleRequest, CreateSigmaRuleResponse } from '@/types/api';

/**
 * Hook to fetch all rules with optional filtering
 * 
 * Critical Quality Gate Rule 3: Infinite Loop Prevention
 * Critical Quality Gate Rule 4: Security-First Development
 */
export function useRules(filters?: RuleFilters) {
  const { isAuthenticated, accessToken } = useAuthStore();

  // Stabilize the SWR key to prevent infinite re-renders
  const key = useMemo(() => {
    return filters ? [`/api/v1/rules`, JSON.stringify(filters)] : '/api/v1/rules';
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
    shouldFetch ? () => rulesApi.getRules(filters) : null,
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
    rules: shouldFetch ? (data?.data || []) : [],
    total: shouldFetch ? (data?.total || 0) : 0,
    isLoading: shouldFetch ? isLoading : false,
    error: shouldFetch ? error : null,
    refresh: shouldFetch ? mutate : () => Promise.resolve(),
    isAuthenticated: shouldFetch,
  };
}

/**
 * Hook for fetching a single rule by ID
 */
export function useRule(ruleId: string | null) {
  const { isAuthenticated, accessToken } = useAuthStore();
  const shouldFetch = isAuthenticated && accessToken && ruleId;

  const { data, error, isLoading, mutate } = useSWR(
    shouldFetch ? ['rule', ruleId] : null,
    shouldFetch ? () => rulesApi.getRule(ruleId!) : null,
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
      const result = await rulesApi.createRule(ruleData);
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
      const result = await rulesApi.createSigmaRule(sigmaYaml);
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
      const result = await rulesApi.updateRule(ruleId, updates);
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
      const result = await rulesApi.toggleRule(ruleId, enabled);
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
      await rulesApi.deleteRule(ruleId);
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