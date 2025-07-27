import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import type {
  LogSourceFilters,
  LogSourceListResponse,
  CreateLogSourceRequest,
  CreateLogSourceResponse,
  LogSourceLookupResponse,
} from '@/types/api';

/**
 * Axios instance for API calls with JWT authentication
 * Automatically adds Authorization header and handles token refresh
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:8080',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to add JWT token to all requests
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor to handle token refresh on 401 errors
 * 
 * Critical Quality Gate Rule 3: Infinite Loop Prevention
 * Critical Quality Gate Rule 4: Security-First Development
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Prevent infinite loop: only retry once per request
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const { refreshToken, clearTokens, setTokens } = useAuthStore.getState();
      
      if (refreshToken) {
        try {
          // Use vanilla axios to prevent infinite interceptor loops
          const response = await axios.post(
            `${import.meta.env.VITE_API_BASE || 'http://localhost:8080'}/api/v1/auth/refresh`,
            { refresh_token: refreshToken },
            {
              timeout: 10000, // Short timeout to prevent hanging
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (response.data?.access_token) {
            setTokens(response.data);
            
            // Retry original request with new token
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`;
            }
            
            return apiClient(originalRequest);
          } else {
            throw new Error('Invalid refresh response');
          }
        } catch (refreshError) {
          // Refresh failed, clear tokens but don't redirect to prevent infinite loops
          console.error('Token refresh failed:', refreshError);
          clearTokens();
          
          // Don't redirect in interceptor to prevent infinite loops
          // Let the AuthGuard handle the unauthenticated state
          return Promise.reject(new Error('Authentication failed - please log in again'));
        }
      } else {
        // No refresh token, clear auth but don't redirect
        console.warn('No refresh token available');
        clearTokens();
        return Promise.reject(new Error('No authentication token - please log in'));
      }
    }
    
    // For non-401 errors or already retried requests, just reject
    return Promise.reject(error);
  }
);

/**
 * Authentication API methods
 */
export const authApi = {
  /**
   * Login with email and password
   */
  login: async (credentials: { email: string; password: string }) => {
    const response = await apiClient.post('/api/v1/auth/login', credentials);
    return response.data;
  },

  /**
   * Refresh access token using refresh token
   */
  refresh: async (refreshToken: string) => {
    const response = await apiClient.post('/api/v1/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  /**
   * Logout and invalidate tokens
   */
  logout: async () => {
    const response = await apiClient.post('/api/v1/auth/logout');
    return response.data;
  },
};

/**
 * Dashboard API methods
 */
export const dashboardApi = {
  /**
   * Get dashboard data with filters
   */
  getDashboard: async (params: {
    from?: string;
    to?: string;
    severity?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/api/v1/dashboard', { params });
    return response.data;
  },
};

/**
 * Assets API methods
 */
export const assetsApi = {
  /**
   * Get asset information by IP address
   */
  getAssetByIp: async (ip: string) => {
    const response = await apiClient.get(`/api/v1/assets/ip/${ip}`);
    return response.data;
  },
};

/**
 * Alerts API methods
 */
export const alertsApi = {
  /**
   * Update alert status
   */
  updateStatus: async (alertId: string, status: string) => {
    const response = await apiClient.post(`/api/v1/alerts/${alertId}/status`, {
      status,
    });
    return response.data;
  },
};

/**
 * Rule Management API functions
 */
export const rulesApi = {
  /**
   * Get all rules for the current tenant
   */
  getRules: async (filters?: import('@/types/api').RuleFilters) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.is_active !== undefined) params.append('is_active', filters.is_active.toString());
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    
    const response = await apiClient.get(`/api/v1/rules?${params.toString()}`);
    return response.data;
  },

  /**
   * Get a specific rule by ID
   */
  getRule: async (ruleId: string) => {
    const response = await apiClient.get(`/api/v1/rules/${ruleId}`);
    return response.data;
  },

  /**
   * Create a new rule
   */
  createRule: async (rule: import('@/types/api').CreateRuleRequest) => {
    const response = await apiClient.post('/api/v1/rules', rule);
    return response.data;
  },

  /**
   * Create a new Sigma rule
   */
  createSigmaRule: async (sigmaYaml: string) => {
    const response = await apiClient.post('/api/v1/rules/sigma', { 
      sigma_yaml: sigmaYaml 
    });
    return response.data;
  },

  /**
   * Test a rule query against recent data
   */
  testRule: async (query: string) => {
    const response = await apiClient.post('/api/v1/rules/test', { query });
    return response.data;
  },

  /**
   * Update an existing rule
   */
  updateRule: async (ruleId: string, updates: import('@/types/api').UpdateRuleRequest) => {
    const response = await apiClient.put(`/api/v1/rules/${ruleId}`, updates);
    return response.data;
  },

  /**
   * Delete a rule
   */
  deleteRule: async (ruleId: string) => {
    const response = await apiClient.delete(`/api/v1/rules/${ruleId}`);
    return response.data;
  },

  /**
   * Toggle rule enabled/disabled status
   */
  toggleRule: async (ruleId: string, enabled: boolean) => {
    const response = await apiClient.put(`/api/v1/rules/${ruleId}`, { enabled });
    return response.data;
  },
}; 

// Log Source Management API
export const logSourceApi = {
  // GET /v1/log_sources - List all log sources (Admin only)
  getLogSources: async (filters?: LogSourceFilters): Promise<LogSourceListResponse> => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.source_type) params.append('source_type', filters.source_type);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    
    const queryString = params.toString();
    const url = queryString ? `/api/v1/log_sources?${queryString}` : '/api/v1/log_sources';
    
    const response = await apiClient.get<LogSourceListResponse>(url);
    return response.data;
  },

  // POST /v1/log_sources - Create a new log source (Admin only)
  createLogSource: async (data: CreateLogSourceRequest): Promise<CreateLogSourceResponse> => {
    const response = await apiClient.post<CreateLogSourceResponse>('/api/v1/log_sources', data);
    return response.data;
  },

  // DELETE /v1/log_sources/{source_id} - Delete a log source (Admin only)
  deleteLogSource: async (sourceId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/api/v1/log_sources/${sourceId}`);
    return response.data;
  },

  // GET /v1/log_sources/by_ip/{ip} - Internal lookup by IP
  getLogSourceByIp: async (ip: string): Promise<LogSourceLookupResponse> => {
    const response = await apiClient.get<LogSourceLookupResponse>(`/api/v1/log_sources/by_ip/${ip}`);
    return response.data;
  }
};

// Enhanced Log Source Management API
export const enhancedLogSourceApi = {
  // GET /v1/log_sources/enhanced - Get enhanced log sources
  getEnhancedLogSources: async (): Promise<{ log_sources: import('@/types/api').LogSource[] }> => {
    const response = await apiClient.get('/api/v1/log_sources/enhanced');
    return response.data;
  },

  // POST /v1/log_sources/enhanced - Create enhanced log source
  createEnhancedLogSource: async (data: import('@/types/api').CreateLogSourceRequest): Promise<{ message: string; log_source_id: string }> => {
    const response = await apiClient.post('/api/v1/log_sources/enhanced', data);
    return response.data;
  },

  // PUT /v1/log_sources/{source_id} - Update log source
  updateLogSource: async (sourceId: string, data: import('@/types/api').UpdateLogSourceRequest): Promise<{ message: string }> => {
    const response = await apiClient.put(`/api/v1/log_sources/${sourceId}`, data);
    return response.data;
  },

  // DELETE /v1/log_sources/{source_id} - Delete enhanced log source
  deleteEnhancedLogSource: async (sourceId: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/api/v1/log_sources/${sourceId}`);
    return response.data;
  },

  // GET /v1/log_sources/stats - Get log source statistics
  getLogSourceStats: async (): Promise<{ stats: import('@/types/api').LogSourceStats[] }> => {
    const response = await apiClient.get('/api/v1/log_sources/stats');
    return response.data;
  },

  // GET /v1/log_sources/groups - Get log source groups
  getLogSourceGroups: async (): Promise<{ groups: import('@/types/api').LogSourceGroup[] }> => {
    const response = await apiClient.get('/api/v1/log_sources/groups');
    return response.data;
  },

  // POST /v1/log_sources/groups - Create log source group
  createLogSourceGroup: async (data: import('@/types/api').CreateLogSourceGroupRequest): Promise<{ message: string; group_id: string }> => {
    const response = await apiClient.post('/api/v1/log_sources/groups', data);
    return response.data;
  }
};