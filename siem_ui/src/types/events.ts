export interface Event {
  event_id: string;
  tenant_id: string;
  event_timestamp: number;
  source_ip: string;
  source_type: string;
  source_name: string;
  raw_event: string;
  event_category: string;
  event_outcome: string;
  event_action: string;
  is_threat: number;
}

export interface TimeRange {
  start_unix: number;
  end_unix: number;
}

export interface EventFilter {
  field: string;
  operator: string; // "=", "!=", "LIKE", "NOT LIKE", ">", "<", ">=", "<="
  value: string;
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

export interface EventSearchRequest {
  time_range?: TimeRange;
  free_text?: string;
  filters?: EventFilter[];
  limit?: number;
  offset?: number;
  sort?: SortConfig;
  cursor?: string; // For cursor-based pagination
  enable_streaming?: boolean; // Enable streaming for large datasets
}

export interface EventSearchResponse {
  events: Event[];
  total_count: number;
  has_more: boolean;
  next_cursor?: string; // Next cursor for pagination
  previous_cursor?: string; // Previous cursor for pagination
}

export interface EventFiltersState {
  filters: EventFilter[];
  timeRange: TimeRange | null;
  freeText: string;
  sortConfig: SortConfig;
  addFilter: (filter: EventFilter) => void;
  removeFilter: (index: number) => void;
  setTimeRange: (timeRange: TimeRange | null) => void;
  setFreeText: (text: string) => void;
  setSortConfig: (sortConfig: SortConfig) => void;
  clearAllFilters: () => void;
}

export const FILTER_OPERATORS = [
  { value: '=', label: 'Equals' },
  { value: '!=', label: 'Not Equals' },
  { value: 'LIKE', label: 'Contains' },
  { value: 'NOT LIKE', label: 'Does Not Contain' },
  { value: '>', label: 'Greater Than' },
  { value: '<', label: 'Less Than' },
  { value: '>=', label: 'Greater Than or Equal' },
  { value: '<=', label: 'Less Than or Equal' }
];

export const COMMON_FIELDS = [
  { value: 'tenant_id', label: 'Tenant ID' },
  { value: 'source_ip', label: 'Source IP' },
  { value: 'event_category', label: 'Event Category' },
  { value: 'event_action', label: 'Event Action' },
  { value: 'event_outcome', label: 'Event Outcome' },
  { value: 'source_type', label: 'Source Type' },
  { value: 'is_threat', label: 'Is Threat' }
];

export const TIME_RANGE_PRESETS = [
  {
    label: 'Last 15 minutes',
    getValue: () => ({
      start_unix: Math.floor((Date.now() - 15 * 60 * 1000) / 1000),
      end_unix: Math.floor(Date.now() / 1000)
    })
  },
  {
    label: 'Last hour',
    getValue: () => ({
      start_unix: Math.floor((Date.now() - 60 * 60 * 1000) / 1000),
      end_unix: Math.floor(Date.now() / 1000)
    })
  },
  {
    label: 'Last 24 hours',
    getValue: () => ({
      start_unix: Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000),
      end_unix: Math.floor(Date.now() / 1000)
    })
  },
  {
    label: 'Last 7 days',
    getValue: () => ({
      start_unix: Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000),
      end_unix: Math.floor(Date.now() / 1000)
    })
  },
  {
    label: 'Last 30 days',
    getValue: () => ({
      start_unix: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000),
      end_unix: Math.floor(Date.now() / 1000)
    })
  }
];