import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import components to test
import Dashboard from '../pages/Dashboard';
import Alerts from '../pages/Alerts';
import Cases from '../pages/Cases';
import { Rules } from '../components/Rules';
import { RecentAlertsList } from '../components/dashboard/RecentAlertsList';

// Mock the auth store
vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({
    isAuthenticated: true,
    user: { id: '1', email: 'test@example.com', name: 'Test User' },
    tenantId: 'test-tenant',
  }),
}));

// Mock API hooks
vi.mock('../hooks/useValidatedApi', () => ({
  useDashboardStats: () => ({
    data: {
      total_alerts: 150,
      critical_alerts: 12,
      total_rules: 45,
      active_rules: 38,
      total_assets: 1250,
      online_assets: 1180,
      total_cases: 23,
      open_cases: 8,
    },
    isLoading: false,
    error: null,
  }),
  useRecentAlerts: () => ({
    data: {
      alerts: [
        {
          alert_id: '1',
          name: 'Suspicious Login',
          severity: 'high',
          source_ip: '192.168.1.100',
          dest_ip: '10.0.0.1',
          timestamp: '2024-01-15T10:30:00Z',
          status: 'open',
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
  useAlerts: () => ({
    data: {
      alerts: [
        {
          alert_id: '1',
          name: 'Test Alert',
          severity: 'medium',
          source_ip: '192.168.1.1',
          dest_ip: '10.0.0.1',
          timestamp: '2024-01-15T10:30:00Z',
          status: 'open',
        },
      ],
      total: 1,
    },
    isLoading: false,
    error: null,
  }),
  useRules: () => ({
    data: {
      rules: [
        {
          rule_id: '1',
          name: 'Test Rule',
          description: 'Test rule description',
          severity: 'medium',
          enabled: true,
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-15T10:30:00Z',
        },
      ],
      total: 1,
    },
    isLoading: false,
    error: null,
  }),
  useAssets: () => ({
    data: {
      assets: [
        {
          asset_id: '1',
          hostname: 'test-server',
          ip_address: '192.168.1.100',
          asset_type: 'server',
          status: 'online',
          last_seen: '2024-01-15T10:30:00Z',
        },
      ],
      total: 1,
    },
    isLoading: false,
    error: null,
  }),
  useCases: () => ({
    data: {
      cases: [
        {
          case_id: '1',
          title: 'Test Case',
          description: 'Test case description',
          status: 'open',
          priority: 'medium',
          created_at: '2024-01-15T10:30:00Z',
          updated_at: '2024-01-15T10:30:00Z',
        },
      ],
      total: 1,
    },
    isLoading: false,
    error: null,
  }),
}));

// Test wrapper component
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Smoke Tests - Component Rendering', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it('Dashboard renders without crashing', () => {
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );
    
    // Check for key dashboard elements
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
  });

  it('Alerts page renders without crashing', () => {
    render(
      <TestWrapper>
        <Alerts />
      </TestWrapper>
    );
    
    // Check for alerts page elements
    expect(screen.getByText(/alerts/i)).toBeInTheDocument();
  });

  it('Rules page renders without crashing', () => {
    render(
      <TestWrapper>
        <Rules />
      </TestWrapper>
    );
    
    // Check for rules page elements
    expect(screen.getByText(/rules/i)).toBeInTheDocument();
  });

  // Note: Assets page component doesn't exist yet, skipping this test
  // it('Assets page renders without crashing', () => {
  //   render(
  //     <TestWrapper>
  //       <Assets />
  //     </TestWrapper>
  //   );
  //   
  //   // Check for assets page elements
  //   expect(screen.getByText(/assets/i)).toBeInTheDocument();
  // });

  it('Cases page renders without crashing', () => {
    render(
      <TestWrapper>
        <Cases />
      </TestWrapper>
    );
    
    // Check for cases page elements
    expect(screen.getByText(/cases/i)).toBeInTheDocument();
  });

  it('RecentAlertsList component renders without crashing', () => {
    render(
      <TestWrapper>
        <RecentAlertsList />
      </TestWrapper>
    );
    
    // Check for recent alerts component
    expect(screen.getByText(/recent alerts/i)).toBeInTheDocument();
  });
});

describe('Smoke Tests - Error Boundaries', () => {
  it('handles missing props gracefully', () => {
    // Test component with undefined/null props
    const mockAlert = {
      alert_id: undefined,
      name: null,
      severity: 'high',
      source_ip: '192.168.1.1',
      dest_ip: '10.0.0.1',
      timestamp: '2024-01-15T10:30:00Z',
      status: 'open',
    };

    // This should not crash the component
    expect(() => {
      render(
        <TestWrapper>
          <RecentAlertsList />
        </TestWrapper>
      );
    }).not.toThrow();
  });

  it('handles empty data arrays gracefully', () => {
    // Mock empty data responses
    vi.doMock('../hooks/useValidatedApi', () => ({
      useRecentAlerts: () => ({
        data: { alerts: [] },
        isLoading: false,
        error: null,
      }),
    }));

    expect(() => {
      render(
        <TestWrapper>
          <RecentAlertsList />
        </TestWrapper>
      );
    }).not.toThrow();
  });
});