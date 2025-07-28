import { create } from 'zustand';
import { authStorage } from '@/lib/secureStorage';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  setTokens: (tokens: {
    access_token: string;
    refresh_token: string;
    tenant_id: string;
  }) => void;
  clearTokens: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Initialize state from secure storage
const getInitialState = (): AuthState => {
  const storedData = authStorage.getAuthData();
  if (storedData) {
    return {
      accessToken: storedData.accessToken,
      refreshToken: storedData.refreshToken,
      tenantId: storedData.tenantId,
      isAuthenticated: storedData.isAuthenticated,
      isLoading: false,
      error: null,
    };
  }
  return {
    accessToken: null,
    refreshToken: null,
    tenantId: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  };
};

export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  // Initialize with secure storage data
  ...getInitialState(),

  // Actions
  setTokens: (tokens) => {
    const newState = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tenantId: tokens.tenant_id,
      isAuthenticated: true,
      error: null,
    };
    
    // Save to secure storage
    authStorage.setAuthData({
      accessToken: newState.accessToken,
      refreshToken: newState.refreshToken,
      tenantId: newState.tenantId,
      isAuthenticated: newState.isAuthenticated,
    });
    
    set(newState);
  },

  clearTokens: () => {
    const newState = {
      accessToken: null,
      refreshToken: null,
      tenantId: null,
      isAuthenticated: false,
      error: null,
    };
    
    // Clear from secure storage
    authStorage.clearAuthData();
    
    set(newState);
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),
}));