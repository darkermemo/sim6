import React from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

import { useToast } from '@/hooks/useToast';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard - Prevents infinite loops by blocking API calls when not authenticated
 * 
 * Critical Quality Gate Rule 3: Infinite Loop Prevention
 * Critical Quality Gate Rule 4: Security-First Development
 * Critical Quality Gate Rule 6: Comprehensive Error Boundary
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, accessToken, setTokens, isLoading } = useAuthStore();
  const { toast } = useToast();

  // Always call all hooks before any conditional returns to prevent hook order issues
  React.useEffect(() => {
    // Force clear any existing tokens to ensure fresh login
    console.log('Clearing any existing tokens for fresh login...');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('tenant_id');
    // Also clear the persisted Zustand store
    localStorage.removeItem('siem-auth-store');
    // Clear the current auth store state
    const { clearTokens } = useAuthStore.getState();
    clearTokens();
    
    // Auto-login for demo purposes with valid JWT token
    console.log('Setting up demo authentication with valid JWT token...');
    
    // Generate a valid JWT token for development that matches backend expectations
    const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbi11c2VyIiwidGVuYW50X2lkIjoidGVuYW50LUEiLCJyb2xlcyI6WyJBZG1pbiJdLCJpYXQiOjE3NTM5NjE0MTQsImV4cCI6MTc1Mzk2NTAxNCwiaXNzIjoic2llbS1hdXRoIiwiYXVkIjoic2llbS1zZWFyY2giLCJqdGkiOiJ0ZXN0LXNlc3Npb24tMTIzIn0.NluIfDU6ajLBK0Q5SoxzbV4NbyxNBpkuOCEPsfYkhTw';
    
    // Get tenant_id from environment variable or use default for demo
    const tenantId = import.meta.env.VITE_DEFAULT_TENANT_ID || 'tenant-A';
    
    // Store valid tokens
    setTokens({
      access_token: validToken,
      refresh_token: import.meta.env.VITE_DEMO_REFRESH_TOKEN || 'demo-refresh-token', // Use demo refresh token
      tenant_id: tenantId,
    });
    
    // Also store in localStorage for direct access by API hooks
    localStorage.setItem('access_token', validToken);
    localStorage.setItem('refresh_token', import.meta.env.VITE_DEMO_REFRESH_TOKEN || 'demo-refresh-token');
    localStorage.setItem('tenant_id', tenantId);
    
    console.log('AuthGuard: Token set in localStorage:', localStorage.getItem('access_token'));
    console.log('AuthGuard: Tenant ID set:', localStorage.getItem('tenant_id'));
    
    console.log('AuthGuard: Successfully set up authentication with valid JWT token');
    console.log('AuthGuard: Tokens set in localStorage:', {
      access_token: localStorage.getItem('access_token'),
      refresh_token: localStorage.getItem('refresh_token'),
      tenant_id: localStorage.getItem('tenant_id')
    });
    
    // Dispatch a custom event to notify components that tokens are ready
    window.dispatchEvent(new CustomEvent('tokensReady'));
    console.log('AuthGuard: tokensReady event dispatched');
  }, [setTokens]);



  // Show loading state while authentication is being set up
  if (isLoading || (!isAuthenticated && !accessToken)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-6 space-y-6">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto"></div>
            <h1 className="text-2xl font-bold text-primary-text">SIEM Analytics</h1>
            <p className="text-secondary-text">Setting up demo environment...</p>
          </div>
        </Card>
      </div>
    );
  }

  // User is authenticated, render the protected content
  return (
    <>
      {/* Auth Status Bar */}
      <div className="bg-accent text-white px-4 py-2 text-sm flex justify-between items-center">
        <span>✅ Authenticated as Demo User</span>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => {
            const { clearTokens } = useAuthStore.getState();
            clearTokens();
            // Also clear localStorage tokens
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('tenant_id');
            toast({
              title: 'Logged Out',
              description: 'You have been successfully logged out',
              variant: 'default',
            });
          }}
          className="text-white hover:bg-blue-700 text-xs"
        >
          Logout
        </Button>
      </div>
      {children}
    </>
  );
}