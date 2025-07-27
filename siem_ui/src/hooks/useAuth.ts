import { useState, useEffect } from 'react';
import type { LoginRequest, AuthResponse, RefreshRequest } from '../types/api';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  tenantId: string | null;
  loading: boolean;
  error: string | null;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    tenantId: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Check for existing token in localStorage
    const token = localStorage.getItem('access_token');
    const tenantId = localStorage.getItem('tenant_id');
    
    if (token && tenantId) {
      setAuthState({
        isAuthenticated: true,
        token,
        tenantId,
        loading: false,
        error: null,
      });
    } else {
      setAuthState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  const login = async (credentials: LoginRequest): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, loading: true, error: null }));
    
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
      
      // Store tokens
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('tenant_id', data.tenant_id);

      setAuthState({
        isAuthenticated: true,
        token: data.access_token,
        tenantId: data.tenant_id,
        loading: false,
        error: null,
      });

      return true;
    } catch (error) {
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }));
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('tenant_id');
    
    setAuthState({
      isAuthenticated: false,
      token: null,
      tenantId: null,
      loading: false,
      error: null,
    });
  };

  const refreshToken = async (): Promise<boolean> => {
    const refreshTokenValue = localStorage.getItem('refresh_token');
    
    if (!refreshTokenValue) {
      logout();
      return false;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:8080'}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshTokenValue } as RefreshRequest),
      });

      if (!response.ok) {
        logout();
        return false;
      }

      const data = await response.json();
      
      localStorage.setItem('access_token', data.access_token);
      
      setAuthState(prev => ({
        ...prev,
        token: data.access_token,
        tenantId: data.tenant_id,
      }));

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
    refreshToken,
  };
};