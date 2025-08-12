import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Custom hook to sync state with URL query parameters
 * Provides read/write access to URL state with type safety
 */
export function useUrlState<T extends Record<string, string>>(
  defaultValues: T
): [T, (updates: Partial<T>) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read current state from URL with defaults
  const state = Object.keys(defaultValues).reduce((acc, key) => {
    const urlValue = searchParams.get(key);
    acc[key as keyof T] = (urlValue ?? defaultValues[key]) as T[keyof T];
    return acc;
  }, {} as T);

  // Update URL with new values
  const setState = useCallback((updates: Partial<T>) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      });
      
      return newParams;
    });
  }, [setSearchParams]);

  // Set initial defaults on mount if not present
  useEffect(() => {
    const hasAnyParam = Object.keys(defaultValues).some(key => searchParams.has(key));
    if (!hasAnyParam) {
      setState(defaultValues);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return [state, setState];
}
