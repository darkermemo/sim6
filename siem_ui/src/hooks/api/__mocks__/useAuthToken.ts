import { vi } from 'vitest';

/**
 * Mock implementation of useAuthToken hook for testing.
 * Provides stable default values that can be overridden per test.
 */
export const useAuthToken = vi.fn().mockReturnValue({
  tokenReady: true,
  tokenError: null,
  token: 'test-jwt',
});