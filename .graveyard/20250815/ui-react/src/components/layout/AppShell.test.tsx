import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';

// Mock the health hook
vi.mock('@/lib/health', () => ({
  useHealth: () => ({
    data: {
      ok: true,
      clickhouse: { ok: true },
      redis_detail: { ok: true }
    }
  }),
  getHealthColor: (status: { ok: boolean } | undefined) => status?.ok ? 'green' : 'gray'
}));

describe('AppShell', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders navigation items', () => {
    renderWithProviders(<AppShell />);
    
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(screen.getByText('Health')).toBeInTheDocument();
  });

  it('displays health pills for ClickHouse and Redis', () => {
    renderWithProviders(<AppShell />);
    
    expect(screen.getByText('ClickHouse')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    
    // Check for status badges (OK or N/A)
    const okBadges = screen.getAllByText('OK');
    const naBadges = screen.queryAllByText('N/A');
    expect(okBadges.length + naBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('renders tenant selector in top bar', () => {
    renderWithProviders(<AppShell />);
    
    expect(screen.getByText('Tenant 101')).toBeInTheDocument();
  });

  it('renders time range selector', () => {
    renderWithProviders(<AppShell />);
    
    expect(screen.getByText('Last 15 minutes')).toBeInTheDocument();
  });
});
