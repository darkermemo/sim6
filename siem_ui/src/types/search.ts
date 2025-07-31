/**
 * TypeScript type definitions for ClickHouse search functionality
 */

// Event interface definition
export interface Event {
  event_id: string;
  event_timestamp: string;
  event_category: string;
  event_action: string;
  event_outcome?: string;
  source_ip?: string;
  destination_ip?: string;
  user_id?: string;
  user_name?: string;
  severity?: string;
  message?: string;
  raw_event?: any;
  metadata?: Record<string, any>;
}

// Base API response wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Time range for search queries
export interface TimeRange {
  start: string; // ISO 8601 timestamp
  end: string;   // ISO 8601 timestamp
}

// Search filter operators
export type FilterOperator = 
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'regex'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'between'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'range';

// Search filter definition
export interface SearchFilter {
  field: string;
  operator: FilterOperator;
  value: string | string[] | number | number[] | boolean;
  case_sensitive?: boolean;
}

// Pagination parameters
export interface Pagination {
  offset: number;
  limit: number;
}

// Sort field definition
export interface SortField {
  field: string;
  direction: 'asc' | 'desc';
}

// Aggregation types
export type AggregationType = 
  | 'terms'
  | 'date_histogram'
  | 'histogram'
  | 'stats'
  | 'cardinality'
  | 'avg'
  | 'sum'
  | 'min'
  | 'max'
  | 'count';

// Aggregation request
export interface AggregationRequest {
  name: string;
  type: AggregationType;
  field: string;
  size?: number;
  interval?: string; // For date_histogram
  ranges?: Array<{ from?: number; to?: number; key?: string }>; // For range aggregations
}

// Aggregation result bucket
export interface AggregationBucket {
  key: string | number;
  doc_count: number;
  key_as_string?: string;
}

// Aggregation result
export interface AggregationResult {
  buckets?: AggregationBucket[];
  value?: number;
  count?: number;
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
}

// Search options
export interface SearchOptions {
  enable_highlighting?: boolean;
  enable_caching?: boolean;
  enable_query_optimization?: boolean;
  enable_streaming?: boolean;
  stream_buffer_size?: number;
  max_results?: number;
  timeout_seconds?: number;
  include_raw_event?: boolean;
  include_metadata?: boolean;
  query_language?: 'lucene' | 'sql' | 'simple';
  explain_query?: boolean;
}

// Main search request
export interface SearchRequest {
  tenant_id: string;
  query?: string;
  time_range?: TimeRange;
  filters: SearchFilter[];
  pagination?: Pagination;
  sorting: SortField[];
  fields: string[];
  aggregations: AggregationRequest[];
  options?: SearchOptions;
}

// Search metadata
export interface SearchMetadata {
  total_hits: number;
  query_time_ms: number;
  cached: boolean;
  query_id: string;
  tenant_id: string;
  shard_info?: {
    total_shards: number;
    successful_shards: number;
    failed_shards: number;
  };
  warnings?: string[];
}

// Search suggestions
export interface SearchSuggestions {
  query_suggestions: string[];
  field_suggestions: Record<string, string[]>;
  completion_suggestions: string[];
}

// Main search response
export interface SearchResponse {
  hits: Event[];
  aggregations: Record<string, AggregationResult>;
  metadata: SearchMetadata;
  suggestions?: SearchSuggestions;
}

// Health check response
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime_seconds: number;
  clickhouse: {
    status: 'connected' | 'disconnected' | 'error';
    version: string;
    active_connections: number;
  };
  redis: {
    status: 'connected' | 'disconnected' | 'error';
    memory_usage: string;
  };
}

// Service status response
export interface StatusResponse {
  service: string;
  version: string;
  uptime: string;
  database: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    query_count: number;
    avg_query_time: number;
  };
  cache: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    hit_rate: number;
    memory_usage: string;
  };
  performance: {
    active_queries: number;
    queue_size: number;
    avg_response_time: number;
  };
}

// Schema information
export interface SchemaField {
  type: string;
  searchable: boolean;
  aggregatable: boolean;
  description?: string;
}

export interface SchemaTable {
  columns: Record<string, string>;
  indexes: string[];
  description?: string;
}

export interface SchemaResponse {
  tables: Record<string, SchemaTable>;
  fields: Record<string, SchemaField>;
}

// Query builder types
export interface QueryBuilderField {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'ip' | 'array';
  label: string;
  searchable: boolean;
  aggregatable: boolean;
  operators: FilterOperator[];
  suggestions?: string[];
}

export interface QueryBuilderRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: any;
  type: 'rule';
}

export interface QueryBuilderGroup {
  id: string;
  type: 'group';
  combinator: 'and' | 'or';
  rules: (QueryBuilderRule | QueryBuilderGroup)[];
}

export interface QueryBuilderState {
  query: QueryBuilderGroup;
  fields: QueryBuilderField[];
  timeRange?: TimeRange;
  sorting: SortField[];
  pagination: Pagination;
}

// Search history and saved searches
export interface SavedSearch {
  id: string;
  name: string;
  description?: string;
  query: SearchRequest;
  created_at: string;
  updated_at: string;
  created_by: string;
  tags?: string[];
  is_public: boolean;
}

export interface SearchHistory {
  id: string;
  query: SearchRequest;
  executed_at: string;
  execution_time_ms: number;
  result_count: number;
  user_id: string;
}

// Export/import types
export interface ExportRequest {
  search_request: SearchRequest;
  format: 'csv' | 'json' | 'xlsx' | 'pdf';
  include_headers: boolean;
  max_rows?: number;
  filename?: string;
}

export interface ExportResponse {
  export_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  download_url?: string;
  error_message?: string;
  created_at: string;
  expires_at: string;
}

// Real-time search and streaming
export interface StreamingSearchOptions extends SearchOptions {
  enable_streaming: true;
  stream_buffer_size: number;
  stream_interval_ms?: number;
}

export interface StreamingChunk {
  chunk_id: number;
  hits: Event[];
  is_final: boolean;
  total_chunks?: number;
}

// Advanced search features
export interface FieldStatistics {
  field_name: string;
  total_count: number;
  unique_count: number;
  null_count: number;
  min_value?: string | number;
  max_value?: string | number;
  avg_value?: number;
  top_values: Array<{ value: string; count: number }>;
}

export interface SearchAnalytics {
  query_performance: {
    avg_response_time: number;
    p95_response_time: number;
    p99_response_time: number;
    total_queries: number;
    failed_queries: number;
  };
  popular_fields: Array<{ field: string; usage_count: number }>;
  popular_filters: Array<{ filter: string; usage_count: number }>;
  time_range_distribution: Record<string, number>;
}

// Error types
export interface SearchError {
  code: string;
  message: string;
  details?: Record<string, any>;
  query_id?: string;
  timestamp: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// UI-specific types
export interface SearchUIState {
  isLoading: boolean;
  isStreaming: boolean;
  error: SearchError | null;
  results: SearchResponse | null;
  currentQuery: SearchRequest | null;
  selectedEvents: Event[];
  viewMode: 'table' | 'json' | 'timeline' | 'graph';
  autoRefresh: boolean;
  refreshInterval: number;
}

export interface SearchFiltersUIState {
  activeFilters: SearchFilter[];
  availableFields: QueryBuilderField[];
  filterGroups: QueryBuilderGroup[];
  quickFilters: Array<{ name: string; filter: SearchFilter }>;
}

export interface SearchResultsUIState {
  selectedColumns: string[];
  columnWidths: Record<string, number>;
  sortedColumn: string | null;
  sortDirection: 'asc' | 'desc' | null;
  expandedRows: Set<string>;
  highlightedTerms: string[];
}