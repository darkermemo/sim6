import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_API_BASE: 'http://localhost:8080',
    MODE: 'test',
    DEV: false,
    PROD: false,
    SSR: false
  },
  writable: true
});

// Mock fetch globally
(globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn();

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
(globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Setup cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});