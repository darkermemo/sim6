import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardV2 } from '../useDashboardV2';
import { useAuthToken } from '../../useAuthToken';
import { createSWRWrapper } from '../../../test/utils/createSWRWrapper';

// Mock useAuthToken - Vitest will automatically pick up the mock from __mocks__
vi.mock('../../useAuthToken');

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Mock dashboard payload that matches the expected Rust API response structure
 */
const mockDashboardPayload = {
  total_events: 1500,
  total_alerts: 25,
  alerts_over_time: [],
  top_log_sources: [],
  recent_alerts: [],
};

/**
 * SWR fallback data for successful dashboard response
 * Using the actual SWR key that the hook generates
 */
const filters = { tenant_id: 'tenant-x' };
const swrKey = ['/api/v1/dashboard', filters, 'test-jwt'];

const successFallback = {
  [JSON.stringify(swrKey)]: mockDashboardPayload,
};

// For error testing, we don't provide fallback data
// This will cause SWR to be in loading state initially

describe('useDashboardV2', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.clearAllMocks();
  });

  describe('successful data loading', () => {
    it('returns dashboard data without loading state when SWR cache is seeded', () => {
      const { result } = renderHook(
        () => useDashboardV2(filters),
        { wrapper: createSWRWrapper(successFallback) }
      );

      // SWR has data synchronously because of the fallback
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(result.current.data?.recent_alerts).toEqual([]);
      expect(result.current.data?.total_events).toBe(1500);
      expect(result.current.data?.total_alerts).toBe(25);
    });

    it('handles loading state when token is not ready', () => {
      // Override the mock for this test
      vi.mocked(useAuthToken).mockReturnValueOnce({
        tokenReady: false,
        error: null,
        token: null,
        checkToken: vi.fn(),
        getToken: vi.fn(),
        clearToken: vi.fn(),
      });

      const { result } = renderHook(
        () => useDashboardV2(filters),
        { wrapper: createSWRWrapper(successFallback) }
      );

      // Should be loading when token is not ready
      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('returns error state when SWR cache contains error', () => {
      const errorFallback = {
        [JSON.stringify(swrKey)]: new Error('Dashboard fetch failed'),
      };
      
      const { result } = renderHook(
        () => useDashboardV2(filters),
        { wrapper: createSWRWrapper(errorFallback) }
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toBe('Dashboard fetch failed');
      expect(result.current.data).toBeUndefined();
    });

    it('handles auth token error', () => {
      // Override the mock for this test
      vi.mocked(useAuthToken).mockReturnValueOnce({
        tokenReady: true,
        error: 'Token validation failed',
        token: null,
        checkToken: vi.fn(),
        getToken: vi.fn(),
        clearToken: vi.fn(),
      });

      const { result } = renderHook(
        () => useDashboardV2(filters),
        { wrapper: createSWRWrapper() }
      );

      // Should not be loading when token is null (no SWR request made)
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Token validation failed');
      expect(result.current.data).toBeUndefined();
    });
  });

  describe('integration test with real fetch', () => {
    it('fetches dashboard data when no fallback is provided', async () => {
      // Mock successful fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDashboardPayload,
      });

      const { result } = renderHook(
        () => useDashboardV2(filters),
        { wrapper: createSWRWrapper() } // No fallback - will trigger real fetch
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for SWR to complete the fetch
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockDashboardPayload);
      expect(result.current.error).toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/dashboard?tenant_id=tenant-x',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-jwt',
          }),
        })
      );
    });

    it('handles fetch error in integration test', async () => {
      // Mock failed fetch response
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(
        () => useDashboardV2(filters),
        { wrapper: createSWRWrapper() } // No fallback - will trigger real fetch
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for SWR to handle the error
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.data).toBeUndefined();
    });
  });
});