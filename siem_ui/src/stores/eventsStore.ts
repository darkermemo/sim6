import { create } from 'zustand';
import { Event, EventSearchRequest } from '../types/events';

interface EventsState {
  events: Event[];
  filters: EventSearchRequest;
  isLoading: boolean;
  error: string | null;
  totalCount: number;
  hasMore: boolean;
  
  // Actions
  appendEvents: (newEvents: Event[]) => void;
  clearEvents: () => void;
  setFilters: (filters: EventSearchRequest) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setTotalCount: (count: number) => void;
  setHasMore: (hasMore: boolean) => void;
  replaceEvents: (events: Event[]) => void;
}

export const useEventsStore = create<EventsState>((set) => ({
  events: [],
  filters: {
    limit: 50,
    offset: 0,
    sort: { field: 'event_timestamp', direction: 'desc' },
  },
  isLoading: false,
  error: null,
  totalCount: 0,
  hasMore: false,
  
  appendEvents: (newEvents: Event[]) => set((state) => ({
    events: [...state.events, ...newEvents],
  })),
  
  clearEvents: () => set({
    events: [],
    totalCount: 0,
    hasMore: false,
    error: null,
  }),
  
  setFilters: (filters: EventSearchRequest) => set({ filters }),
  
  setLoading: (isLoading: boolean) => set({ isLoading }),
  
  setError: (error: string | null) => set({ error }),
  
  setTotalCount: (totalCount: number) => set({ totalCount }),
  
  setHasMore: (hasMore: boolean) => set({ hasMore }),
  
  replaceEvents: (events: Event[]) => set({
    events,
    totalCount: events.length,
  }),
}));

export default useEventsStore;