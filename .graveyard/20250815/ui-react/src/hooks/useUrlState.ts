import { useState, useEffect, useCallback } from 'react';

export function useUrlState<T extends Record<string, any>>(key: string, defaultValue: T): [T, (value: Partial<T>) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    
    const url = new URL(window.location.href);
    const param = url.searchParams.get(key);
    
    if (param === null) return defaultValue;
    
    try {
      return JSON.parse(param);
    } catch {
      return defaultValue;
    }
  });

  const updateUrl = useCallback((value: Partial<T>) => {
    if (typeof window === 'undefined') return;
    
    const newState = { ...state, ...value };
    const url = new URL(window.location.href);
    
    if (JSON.stringify(newState) === JSON.stringify(defaultValue)) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, JSON.stringify(newState));
    }
    
    window.history.replaceState({}, '', url.toString());
    setState(newState);
  }, [key, defaultValue, state]);

  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location.href);
      const param = url.searchParams.get(key);
      
      if (param === null) {
        setState(defaultValue);
      } else {
        try {
          setState(JSON.parse(param));
        } catch {
          setState(defaultValue);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [key, defaultValue]);

  return [state, updateUrl];
}