import { FC, ReactNode } from 'react';
import { SWRConfig, Cache } from 'swr';

/**
 * Creates a deterministic SWR test wrapper that provides a fresh cache for each test.
 * This prevents cross-test bleeding and allows seeding SWR with mock responses.
 * 
 * @param fallback - Object containing mock responses keyed by request URL
 * @returns React component that wraps children with SWRConfig
 */
export function createSWRWrapper(fallback: Record<string, unknown> = {}): FC<{ children: ReactNode }> {
  return ({ children }) => (
    <SWRConfig
      value={{
        dedupingInterval: 0,
        provider: () => new Map(Object.entries(fallback)) as Cache<any>,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}