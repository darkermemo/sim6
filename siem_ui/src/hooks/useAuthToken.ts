import { useState, useEffect, useCallback } from 'react';
import { StorageProvider, useStorage, BrowserStorageProvider } from '../utils/storage';

/**
 * Token storage interface for dependency injection
 * @deprecated Use StorageProvider from utils/storage instead
 */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}



/**
 * Token validation utility
 * Checks if token exists and is not a placeholder value
 */
function isValidToken(token: string | null): boolean {
  return !!token && token !== 'null' && token !== 'undefined' && token.trim().length > 0;
}

/**
 * Custom hook for managing authentication token state
 * Provides token availability, validation, and event-driven updates
 * 
 * @param storage - Token storage implementation (defaults to localStorage)
 * @param tokenKey - Storage key for the token (defaults to 'access_token')
 * @param maxWaitTime - Maximum time to wait for token (defaults to 10000ms)
 */
export function useAuthToken(
  storage?: StorageProvider,
  tokenKey: string = 'access_token',
  maxWaitTime: number = 10000
) {
  const contextStorage = useStorage();
  const tokenStorage = storage || contextStorage || new BrowserStorageProvider();
  const [tokenReady, setTokenReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check token availability and validity
   * Returns true if token is available and valid
   */
  const checkToken = useCallback((): boolean => {
    try {
      const currentToken = tokenStorage.getItem(tokenKey);
      
      if (isValidToken(currentToken)) {
        setToken(currentToken);
        setTokenReady(true);
        setError(null);
        return true;
      } else {
        setToken(null);
        setTokenReady(false);
        return false;
      }
    } catch (err) {
      setError(`Failed to access token storage: ${err}`);
      setTokenReady(false);
      return false;
    }
  }, [tokenStorage, tokenKey]);

  /**
   * Get current token value
   * Returns null if token is not ready or invalid
   */
  const getToken = useCallback((): string | null => {
    if (!tokenReady) return null;
    return token;
  }, [token, tokenReady]);

  /**
   * Clear token and reset state
   */
  const clearToken = useCallback((): void => {
    try {
      tokenStorage.removeItem(tokenKey);
      setToken(null);
      setTokenReady(false);
      setError(null);
    } catch (err) {
      setError(`Failed to clear token: ${err}`);
    }
  }, [tokenStorage, tokenKey]);

  useEffect(() => {
    // Check immediately on mount
    if (checkToken()) return;

    // Listen for the tokensReady event from AuthGuard
    const handleTokensReady = () => {
      checkToken();
    };

    window.addEventListener('tokensReady', handleTokensReady);

    // Fallback: check periodically for up to maxWaitTime
    const interval = setInterval(() => {
      if (checkToken()) {
        clearInterval(interval);
      }
    }, 500);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!tokenReady) {
        setError(`Token not available after ${maxWaitTime}ms`);
      }
    }, maxWaitTime);

    return () => {
      window.removeEventListener('tokensReady', handleTokensReady);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [checkToken, tokenReady, maxWaitTime]);

  return {
    /** Whether token is ready and valid */
    tokenReady,
    /** Current token value (null if not ready) */
    token: getToken(),
    /** Any error that occurred during token management */
    error,
    /** Function to manually check token availability */
    checkToken,
    /** Function to get current token */
    getToken,
    /** Function to clear token and reset state */
    clearToken,
  };
}

export { BrowserStorageProvider };