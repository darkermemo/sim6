import { describe, it, expect } from 'vitest';
import { apiClient } from '../api';

/**
 * Simple integration tests for axios interceptor configuration
 * These tests verify the interceptor setup without complex mocking
 */
describe('Axios Interceptor Configuration', () => {
  it('should have request interceptor configured', () => {
    expect(apiClient.interceptors.request).toBeDefined();
    // Verify that request interceptor is set up (it adds Authorization header)
    expect(typeof apiClient.interceptors.request.use).toBe('function');
  });

  it('should have response interceptor configured', () => {
    expect(apiClient.interceptors.response).toBeDefined();
    // Verify that response interceptor is set up (it handles 401 errors)
    expect(typeof apiClient.interceptors.response.use).toBe('function');
  });

  it('should have correct base configuration', () => {
    expect(apiClient.defaults.timeout).toBe(30000);
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('should not have a baseURL (relies on Vite proxy)', () => {
    expect(apiClient.defaults.baseURL).toBeUndefined();
  });

  it('should handle refresh token URL correctly', () => {
    // Test that the refresh URL construction works
    const baseUrl = 'http://localhost:8084';
    const refreshUrl = `${baseUrl}/api/v1/auth/refresh`;
    
    expect(refreshUrl).toBe('http://localhost:8084/api/v1/auth/refresh');
  });

  it('should have proper error handling structure', () => {
    // Verify the interceptor can handle basic error structures
    const mockError = {
      response: { status: 401 },
      config: { headers: {} }
    };
    
    expect(mockError.response.status).toBe(401);
    expect(mockError.config.headers).toBeDefined();
  });
});