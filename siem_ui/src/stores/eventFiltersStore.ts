import { create } from 'zustand';
import { EventFiltersState, EventFilter, TimeRange, SortConfig, TIME_RANGE_PRESETS } from '../types/events';

export const useEventFilters = create<EventFiltersState>((set) => ({
  filters: [],
  timeRange: null, // Default to no time filter (show all events)
  freeText: '',
  sortConfig: { field: 'event_timestamp', direction: 'desc' }, // Default: newest first
  
  addFilter: (filter: EventFilter) => set((state) => ({
    filters: [...state.filters, filter]
  })),
  
  removeFilter: (index: number) => set((state) => ({
    filters: state.filters.filter((_, i) => i !== index)
  })),
  
  setTimeRange: (timeRange: TimeRange | null) => set({ timeRange }),
  
  setFreeText: (freeText: string) => set({ freeText }),
  
  setSortConfig: (sortConfig: SortConfig) => set({ sortConfig }),
  
  clearAllFilters: () => set({
    filters: [],
    freeText: ''
  })
}));