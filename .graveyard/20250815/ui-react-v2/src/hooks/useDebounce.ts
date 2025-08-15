/**
 * useDebounce - Performance hook for delaying API calls
 * 
 * Prevents spam API calls while typing, essential for:
 * - Query compilation while user types
 * - Search-as-you-type features
 * - Auto-complete functionality
 * - Performance optimization
 */

import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
