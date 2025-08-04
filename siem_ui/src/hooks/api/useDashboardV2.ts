import useSWR from 'swr';
import { DashboardV2ResponseSchema, type DashboardV2Response } from '../../schemas/api-validation';
import { validateApiResponse } from '../../schemas/api-validation';
import { useAuthToken, type TokenStorage } from '../useAuthToken';
import {
  // ApiError,
  NetworkError,
  AuthError,
  ServerError,
  ValidationError,
  ErrorHandler,
  isApiError
} from '../../types/api-errors';

interface DashboardFilters {
  from?: string; // RFC3339 format
  to?: string;   // RFC3339 format
  severity?: string; // comma-separated list
  tenant_id?: string;
}

/**
 * Fetcher function for the new /api/v1/dashboard endpoint
 * Validates response against DashboardV2ResponseSchema
 * Includes authentication headers for secure API access
 * 
 * @param token - Authentication token
 * @param filters - Optional dashboard filters
 * @returns Promise<DashboardV2Response> - Validated dashboard data
 * @throws {AuthError} - When token is missing or invalid
 * @throws {NetworkError} - When network request fails
 * @throws {ServerError} - When server returns error response
 * @throws {ValidationError} - When response data is invalid
 */
async function fetchDashboardV2(
  token: string,
  filters?: DashboardFilters
): Promise<DashboardV2Response> {
  if (!token || token.trim().length === 0) {
    throw AuthError.noToken();
  }

  // Build URL with query parameters
  const params = new URLSearchParams();
  if (filters?.from) params.append('from', filters.from);
  if (filters?.to) params.append('to', filters.to);
  if (filters?.severity) params.append('severity', filters.severity);
  if (filters?.tenant_id) params.append('tenant_id', filters.tenant_id);
  
  const queryString = params.toString();
  const url = `/api/v1/dashboard${queryString ? `?${queryString}` : ''}`;
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  let response: Response;
  
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'same-origin'
    });
  } catch (error) {
    // Network errors (CORS, connection issues, etc.)
    throw NetworkError.fromFetchError(error, url);
  }
  
  // Handle authentication errors
  if (response.status === 401 || response.status === 403) {
    throw AuthError.fromResponse(response.status, response.statusText, url);
  }
  
  // Handle other HTTP errors
  if (!response.ok) {
    let errorBody: string | undefined;
    try {
      errorBody = await response.text();
    } catch {
      // Ignore errors reading response body
    }
    throw ServerError.fromResponse(response, url, errorBody);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const responseText = await response.text().catch(() => 'Unable to read response');
    throw ValidationError.parseError(error, responseText);
  }
  
  // Validate the response against our schema
  try {
    return validateApiResponse(data, DashboardV2ResponseSchema);
  } catch (error) {
    // Convert schema validation errors to our ValidationError type
    throw ValidationError.fromZodError(error, data);
  }
}

/**
 * SWR hook for the new Dashboard V2 API endpoint
 * Returns validated dashboard data with loading and error states
 * 
 * @param filters - Optional dashboard filters
 * @param storage - Token storage implementation (for testing)
 * @returns Dashboard data, loading states, and error information
 */
export function useDashboardV2(
  filters?: DashboardFilters,
  storage?: TokenStorage
) {
  // Use the token management hook
  const { tokenReady, token, error: tokenError } = useAuthToken(storage);
  
  const swrKey = tokenReady && token ? ['dashboard-v2', filters] : null;
  
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<DashboardV2Response>(
    swrKey,
    ([_url, filters, token]: [string, DashboardFilters | undefined, string]) => {
      return fetchDashboardV2(token, filters);
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 30000, // Refresh every 30 seconds
      errorRetryCount: 3,
      errorRetryInterval: 5000,
      onError: (error) => {
        // Use proper error handling
        const apiError = isApiError(error) ? error : ErrorHandler.categorizeError(error, '/api/v1/dashboard');
        ErrorHandler.logError(apiError, 'useDashboardV2');
      },
      onSuccess: () => {
        // Only log success in development
        if (import.meta.env.DEV) {
          console.log('Dashboard V2 API Success - received data');
        }
      }
    }
  );

  // Combine token and API errors
  const combinedError = tokenError || error;

  return {
    /** Dashboard data from the new V2 API */
    data,
    /** Loading state - true during initial load */
    isLoading: isLoading || (!tokenReady && !tokenError),
    /** Validating state - true during background refresh */
    isValidating,
    /** Error object if request failed */
    error: combinedError,
    /** Whether data is empty/null */
    isEmpty: !data,
    /** Manual refresh function */
    mutate,
    /** Whether currently refreshing */
    isRefreshing: isValidating && !!data,
    /** Whether token is ready */
    tokenReady,
  };
}

export type { DashboardV2Response, AlertsOverTimeData, TopLogSourceData, RecentAlertV2 } from '../../schemas/api-validation';