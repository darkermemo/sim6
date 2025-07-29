import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import type { LoginRequest, AuthResponse, RefreshRequest } from '../types/api';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  tenantId: string | null;
  loading: boolean;
  error: string | null;
}

export const useAuth = () => {
  const {
    accessToken,
    refreshToken,
    tenantId,
    isAuthenticated,
    isLoading,
    error,
    setTokens,
    clearTokens,
    setLoading,
    setError
  } = useAuthStore();

  // Legacy state for backward compatibility
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    tenantId: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Sync with secure storage state
    setAuthState({
      isAuthenticated,
      token: accessToken,
      tenantId,
      loading: isLoading,
      error,
    });
  }, [accessToken, tenantId, isAuthenticated, isLoading, error]);

  const login = async (credentials: LoginRequest): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8080'}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data: AuthResponse = await response.json();
      
      // Store tokens securely using encrypted storage
      setTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        tenant_id: data.tenant_id,
      });

      setLoading(false);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Login failed');
      setLoading(false);
      return false;
    }
  };

  const logout = () => {
    // Clear tokens from secure storage
    clearTokens();
  };

  const refreshTokenFn = async (): Promise<boolean> => {
    if (!refreshToken) {
      logout();
      return false;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8080'}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken } as RefreshRequest),
      });

      if (!response.ok) {
        logout();
        return false;
      }

      const data = await response.json();
      
      // Update tokens securely
      setTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        tenant_id: data.tenant_id || tenantId || '',
      });

      return true;
    } catch (error) {
      logout();
      return false;
    }
  };

  return {
    ...authState,
    login,
    logout,
    refreshToken: refreshTokenFn,
  };
};