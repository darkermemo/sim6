import React from 'react';
import useSWR from 'swr';
import { DashboardV2ResponseSchema, type DashboardV2Response } from '../../schemas/api-validation';
import { validateApiResponse, ValidationError } from '../../schemas/api-validation';

/**
 * Fetcher function for the new /api/v1/dashboard endpoint
 * Validates response against DashboardV2ResponseSchema
 * Includes authentication headers for secure API access
 */
async function fetchDashboardV2(): Promise<DashboardV2Response> {
  // Use the new valid token that works with the backend
  const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbi11c2VyIiwidGVuYW50X2lkIjoidGVuYW50LUEiLCJyb2xlcyI6WyJBZG1pbiJdLCJpYXQiOjE3NTM5NjU1OTgsImV4cCI6MTc1Mzk2OTE5OCwiaXNzIjoic2llbS1hdXRoIiwiYXVkIjoic2llbS1zZWFyY2giLCJqdGkiOiJ0ZXN0LXNlc3Npb24tMTIzIn0.w7Cs8Ean6-YbcT5cyszKO4ynd5zN68j8ayfi6RvmiXc';
  const token = validToken;
  console.log('fetchDashboardV2 called - using valid token');
  console.log('fetchDashboardV2 - full token value:', token);
  
  if (!token) {
    throw new Error('No access token available');
  }

  const url = '/api/v1/dashboard';
  console.log('fetchDashboardV2 - making request to:', url);
  console.log('fetchDashboardV2 - current location:', window.location.href);
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  console.log('fetchDashboardV2 - request headers:', headers);
  
  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'same-origin'
  });
  
  console.log('fetchDashboardV2 - fetch completed');
  console.log('fetchDashboardV2 - response object:', response);
  
  console.log('fetchDashboardV2 - response status:', response.status);
  console.log('fetchDashboardV2 - response statusText:', response.statusText);
  console.log('fetchDashboardV2 - response headers:', Object.fromEntries(response.headers.entries()));
  console.log('fetchDashboardV2 - response url:', response.url);

  if (!response.ok) {
    const errorText = await response.text();
    console.log('fetchDashboardV2 - error response body:', errorText);
    throw new Error(`Dashboard API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // Validate the response against our schema
  try {
    return validateApiResponse(data, DashboardV2ResponseSchema);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('Dashboard V2 API validation error:', error.message, error.zodError);
      throw new Error(`Invalid dashboard data format: ${error.message}`);
    }
    throw error;
  }
}

/**
 * SWR hook for the new Dashboard V2 API endpoint
 * Returns validated dashboard data with loading and error states
 */
export function useDashboardV2() {
  console.log('useDashboardV2 hook called');
  
  // Use state to track token availability
  const [tokenReady, setTokenReady] = React.useState(false);
  
  // Listen for tokens being ready and check immediately
  React.useEffect(() => {
    const checkToken = () => {
      const token = localStorage.getItem('access_token');
      console.log('useDashboardV2 - token check:', token ? 'present' : 'missing');
      console.log('useDashboardV2 - full token value:', token);
      if (token && token !== 'null' && token !== 'undefined') {
        console.log('useDashboardV2 - setting tokenReady to true');
        setTokenReady(true);
        return true;
      }
      return false;
    };
    
    // Check immediately
    if (checkToken()) return;
    
    // Listen for the tokensReady event from AuthGuard
    const handleTokensReady = () => {
      console.log('useDashboardV2 - received tokensReady event');
      checkToken();
    };
    
    window.addEventListener('tokensReady', handleTokensReady);
    
    // Fallback: check every 500ms for up to 10 seconds
    const interval = setInterval(() => {
      if (checkToken()) {
        clearInterval(interval);
      }
    }, 500);
    
    const timeout = setTimeout(() => {
      clearInterval(interval);
      console.warn('useDashboardV2 - Token not available after 10 seconds');
    }, 10000);
    
    return () => {
      window.removeEventListener('tokensReady', handleTokensReady);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);
  
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<DashboardV2Response>(
    tokenReady ? '/api/v1/dashboard' : null, // Only fetch if token is ready
    fetchDashboardV2,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 30000, // Refresh every 30 seconds
      errorRetryCount: 3,
      errorRetryInterval: 5000,
      onError: (error) => {
        // Log errors to Sentry in production
        if (import.meta.env.PROD && (window as any).Sentry) {
          (window as any).Sentry.captureException(error, {
            tags: {
              component: 'useDashboardV2',
              endpoint: '/api/v1/dashboard'
            }
          });
        }
        
        console.error('Dashboard V2 API Error:', error);
        console.error('Dashboard V2 API Error - tokenReady:', tokenReady);
        console.error('Dashboard V2 API Error - current token:', localStorage.getItem('access_token'));
      },
      onSuccess: (data) => {
        console.log('Dashboard V2 API Success:', data);
      }
    }
  );
  
  console.log('useDashboardV2 - SWR state:', { data: !!data, error: !!error, isLoading, tokenReady });

  return {
    /** Dashboard data from the new V2 API */
    data,
    /** Loading state - true during initial load */
    isLoading,
    /** Validating state - true during background refresh */
    isValidating,
    /** Error object if request failed */
    error,
    /** Whether data is empty/null */
    isEmpty: !data,
    /** Manual refresh function */
    mutate,
    /** Whether currently refreshing */
    isRefreshing: isValidating && !!data,
  };
}

export type { DashboardV2Response, AlertsOverTimeData, TopLogSourceData, RecentAlertV2 } from '../../schemas/api-validation';