import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useUrlState } from '../useUrlState';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/']}>
    {children}
  </MemoryRouter>
);

describe('useUrlState', () => {
  it('returns default values when no URL params present', () => {
    const { result } = renderHook(
      () => useUrlState({ tenant: '101', range: '15m' }),
      { wrapper }
    );

    const [state] = result.current;
    expect(state).toEqual({ tenant: '101', range: '15m' });
  });

  it('updates URL when state changes', () => {
    const { result } = renderHook(
      () => useUrlState({ tenant: '101', range: '15m' }),
      { wrapper }
    );

    const [, setState] = result.current;
    
    act(() => {
      setState({ tenant: '102' });
    });

    const [newState] = result.current;
    expect(newState.tenant).toBe('102');
  });

  it('preserves other params when updating one', () => {
    const { result } = renderHook(
      () => useUrlState({ tenant: '101', range: '15m', q: 'test' }),
      { wrapper }
    );

    const [, setState] = result.current;
    
    act(() => {
      setState({ q: 'updated' });
    });

    const [newState] = result.current;
    expect(newState).toEqual({
      tenant: '101',
      range: '15m',
      q: 'updated'
    });
  });

  it('removes param when set to empty string and returns to default', () => {
    const { result } = renderHook(
      () => useUrlState({ q: 'default-query' }),
      { wrapper }
    );

    // First set a different value
    act(() => {
      const [, setState] = result.current;
      setState({ q: 'custom-query' });
    });

    expect(result.current[0].q).toBe('custom-query');

    // Then set to empty string - should remove from URL and return default
    act(() => {
      const [, setState] = result.current;
      setState({ q: '' });
    });

    const [newState] = result.current;
    expect(newState.q).toBe('default-query');
  });
});
