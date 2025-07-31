/**
 * Enhanced API service with Zod validation
 * Provides type-safe API calls with runtime schema validation
 */
import axios, { AxiosResponse } from 'axios';
import { z } from 'zod';
import {
  AuthResponseSchema,
  TenantsResponseSchema,
  LogSourcesResponseSchema,
  AlertsResponseSchema,
  RulesResponseSchema,
  MetricsResponseSchema,
  DashboardKPIsResponseSchema,
  HealthResponseSchema,
  validateApiResponse,
  type AuthResponse,
  type TenantsResponse,
  type LogSourcesResponse,
  type AlertsResponse,
  type RulesResponse,
  type MetricsResponse,
  type DashboardKPIsResponse,
  type HealthResponse,
  type LogSource,
  type Rule
} from '../schemas/api';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE}/api/v1`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method
    });
    
    // Handle specific error cases
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

/**
 * Generic API call function with validation
 * @param apiCall - Axios API call function
 * @param schema - Zod schema for validation
 * @returns Validated response data
 */
async function makeValidatedApiCall<T>(
  apiCall: () => Promise<AxiosResponse>,
  schema: z.ZodSchema<T>,
  endpoint: string
): Promise<T> {
  try {
    const response = await apiCall();
    return validateApiResponse(schema, response.data);
  } catch (error) {
    console.error(`API call failed for ${endpoint}:`, error);
    
    // Enhanced error reporting
    if (axios.isAxiosError(error)) {
      const errorDetails = {
        endpoint,
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
        data: error.response?.data
      };
      
      // Log to console for debugging
      console.error('Detailed API Error:', errorDetails);
      
      // You could also send this to an error reporting service
      // errorReportingService.report(errorDetails);
    }
    
    throw error;
  }
}

// API service methods with validation
export const validatedApiService = {
  // Authentication
  async login(username: string, password: string): Promise<AuthResponse> {
    return makeValidatedApiCall(
      () => apiClient.post('/auth/login', { username, password }),
      AuthResponseSchema,
      'POST /auth/login'
    );
  },

  // Health check
  async healthCheck(): Promise<HealthResponse> {
    return makeValidatedApiCall(
      () => apiClient.get('/health'),
      HealthResponseSchema,
      'GET /health'
    );
  },

  // Tenants
  async getTenants(): Promise<TenantsResponse> {
    return makeValidatedApiCall(
      () => apiClient.get('/tenants'),
      TenantsResponseSchema,
      'GET /tenants'
    );
  },

  // Log Sources
  async getLogSources(): Promise<LogSourcesResponse> {
    return makeValidatedApiCall(
      () => apiClient.get('/log_sources'),
      LogSourcesResponseSchema,
      'GET /log_sources'
    );
  },

  async createLogSource(logSource: Partial<LogSource>): Promise<LogSourcesResponse> {
    return makeValidatedApiCall(
      () => apiClient.post('/log_sources', logSource),
      LogSourcesResponseSchema,
      'POST /log_sources'
    );
  },

  // Alerts
  async getAlerts(): Promise<AlertsResponse> {
    return makeValidatedApiCall(
      () => apiClient.get('/alerts'),
      AlertsResponseSchema,
      'GET /alerts'
    );
  },

  // Rules
  async getRules(): Promise<RulesResponse> {
    return makeValidatedApiCall(
      () => apiClient.get('/rules'),
      RulesResponseSchema,
      'GET /rules'
    );
  },

  async createRule(rule: Partial<Rule>): Promise<RulesResponse> {
    return makeValidatedApiCall(
      () => apiClient.post('/rules', rule),
      RulesResponseSchema,
      'POST /rules'
    );
  },

  // Metrics
  async getMetrics(): Promise<MetricsResponse> {
    return makeValidatedApiCall(
      () => apiClient.get('/metrics'),
      MetricsResponseSchema,
      'GET /metrics'
    );
  },

  // Dashboard KPIs
  async getDashboardKPIs(): Promise<DashboardKPIsResponse> {
    return makeValidatedApiCall(
      () => apiClient.get('/dashboard'),
      DashboardKPIsResponseSchema,
      'GET /dashboard'
    );
  },

  // Error simulation for testing
  async simulateError(): Promise<unknown> {
    return makeValidatedApiCall(
      () => apiClient.get('/simulate-error'),
      AuthResponseSchema, // This will intentionally fail validation
      'GET /simulate-error'
    );
  }
};

// Export the axios instance for direct use if needed
export { apiClient };

// Utility function to check API connectivity
export async function checkApiConnectivity(): Promise<boolean> {
  try {
    await validatedApiService.healthCheck();
    return true;
  } catch (error) {
    console.error('API connectivity check failed:', error);
    return false;
  }
}