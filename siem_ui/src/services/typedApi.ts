/**
 * Type-safe API client using generated OpenAPI types
 * Provides full type safety for all API endpoints with proper authentication
 */
import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import type { components, operations } from '@/generated/api-types';

// Extract types from the generated schema
type ApiComponents = components;
type ApiOperations = operations;

// Direct type aliases from generated schema
type LogSourceListResponse = ApiComponents['schemas']['LogSourceListResponse'];
type CreateLogSourceRequest = ApiComponents['schemas']['CreateLogSourceRequest'];
type CreateLogSourceResponse = ApiComponents['schemas']['CreateLogSourceResponse'];
type LogSourceLookupResponse = ApiComponents['schemas']['LogSourceLookupResponse'];
type BaselinesListResponse = ApiComponents['schemas']['BaselinesListResponse'];
type CreateBaselinesRequest = ApiComponents['schemas']['CreateBaselinesRequest'];
type EntityBaselinesResponse = ApiComponents['schemas']['EntityBaselinesResponse'];
type PaginationParams = ApiComponents['schemas']['PaginationParams'];

/**
 * Typed Axios instance with JWT authentication
 */
const typedApiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:8084',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor to add JWT token
 */
typedApiClient.interceptors.request.use(
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
 * Response interceptor for token refresh and error handling
 */
typedApiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const { refreshToken, clearTokens, setTokens } = useAuthStore.getState();
      
      if (refreshToken) {
        try {
          const response = await axios.post(
            `${import.meta.env.VITE_API_BASE || 'http://localhost:8084'}/api/v1/auth/refresh`,
            { refresh_token: refreshToken },
            {
              timeout: 10000,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (response.data?.access_token) {
            setTokens(response.data);
            
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`;
            }
            
            return typedApiClient(originalRequest);
          } else {
            throw new Error('Invalid refresh response');
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          clearTokens();
          return Promise.reject(new Error('Authentication failed - please log in again'));
        }
      } else {
        console.warn('No refresh token available');
        clearTokens();
        return Promise.reject(new Error('No authentication token - please log in'));
      }
    }
    
    return Promise.reject(error);
  }
);

/**
 * Type-safe Log Source API
 */
export const typedLogSourceApi = {
  /**
   * List all log sources
   */
  async list(): Promise<LogSourceListResponse> {
    const response = await typedApiClient.get('/api/v1/log_sources');
    return response.data;
  },

  /**
   * Create a new log source
   */
  async create(data: CreateLogSourceRequest): Promise<CreateLogSourceResponse> {
    const response = await typedApiClient.post('/api/v1/log_sources', data);
    return response.data;
  },

  /**
   * Delete a log source
   */
  async delete(sourceId: string): Promise<void> {
    await typedApiClient.delete(`/api/v1/log_sources/${sourceId}`);
  },

  /**
   * Get log source by IP address
   */
  async getByIp(ip: string): Promise<LogSourceLookupResponse> {
    const response = await typedApiClient.get(`/api/v1/log_sources/by_ip/${ip}`);
    return response.data;
  },

  /**
   * Get log sources cache
   */
  async getCache(): Promise<string[][]> {
    const response = await typedApiClient.get('/api/v1/log_sources/cache');
    return response.data;
  },
};

/**
 * Type-safe UEBA API
 */
export const typedUebaApi = {
  /**
   * List baselines with pagination
   */
  async listBaselines(params?: PaginationParams): Promise<BaselinesListResponse> {
    const response = await typedApiClient.get('/api/v1/ueba/baselines', { params });
    return response.data;
  },

  /**
   * Create behavioral baselines
   */
  async createBaselines(data: CreateBaselinesRequest): Promise<void> {
    await typedApiClient.post('/api/v1/ueba/baselines', data);
  },

  /**
   * Get baselines for a specific entity
   */
  async getEntityBaselines(entityId: string): Promise<EntityBaselinesResponse> {
    const response = await typedApiClient.get(`/api/v1/ueba/baselines/entity/${entityId}`);
    return response.data;
  },
};

/**
 * Combined typed API service
 */
export const typedApi = {
  logSources: typedLogSourceApi,
  ueba: typedUebaApi,
};

/**
 * Export types for use in components
 */
export type {
  ApiComponents,
  ApiOperations,
  LogSourceListResponse,
  CreateLogSourceRequest,
  CreateLogSourceResponse,
  LogSourceLookupResponse,
  BaselinesListResponse,
  CreateBaselinesRequest,
  EntityBaselinesResponse,
  PaginationParams,
};

// Export specific component types for convenience
export type LogSource = ApiComponents['schemas']['LogSource'];
export type BehavioralBaseline = ApiComponents['schemas']['BehavioralBaseline'];
export type BaselineResponse = ApiComponents['schemas']['BaselineResponse'];

export default typedApi;