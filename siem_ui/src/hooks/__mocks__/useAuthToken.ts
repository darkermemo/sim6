import { vi } from 'vitest';

export const useAuthToken = vi.fn().mockReturnValue({
  tokenReady: true,
  error: null,
  token: 'test-jwt',
  checkToken: vi.fn(),
  getToken: vi.fn(),
  clearToken: vi.fn(),
});