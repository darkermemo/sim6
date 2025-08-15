/**
 * Complete API type definitions for SIEM v2
 * All endpoints are UI-safe (no raw SQL from client)
 */

// Base types
export type TimeRange = 
  | { last_seconds: number }
  | { from: number; to: number };

export type SortDir = "asc" | "desc";

export type Sort = {
  field: string;
  dir: SortDir;
};

export type FieldMeta = {
  name: string;
  type: string;
  doc?: string;
  searchable: boolean;
  facetable: boolean;
  sortable: boolean;
};

// Search types
export type SearchCompileRequest = {
  tenant_id: string;
  time: TimeRange;
  q: string;
  ast?: any;
  options?: {
    coerce_types?: boolean;
    default_field?: string;
    max_regex_runtime_ms?: number;
  };
};

export type SearchCompileResponse = {
  normalized_q: string;
  ast: any;
  sql: string;
  where_sql: string;
  fields_used: string[];
  time_resolved: { from: number; to: number };
  warnings: string[];
};

export type SearchExecuteRequest = {
  tenant_id: string;
  time: TimeRange;
  q: string;
  ast?: any;
  select?: string[];
  sort?: Sort[];
  limit?: number;
  cursor?: string | null;
  sampling?: { ratio: number };
  consistency?: "strong" | "eventual";
  request_id?: string;
};

export type SearchExecuteResponse = {
  data: {
    rows: number;
    rows_before_limit_at_least: number;
    meta: Array<{ name: string; type: string }>;
    data: any[];
  };
  next_cursor: string | null;
  sql: string;
  took_ms: number;
  warnings: string[];
};

export type SearchEstimateRequest = {
  tenant_id: string;
  time: TimeRange;
  q: string;
  ast?: any;
};

export type SearchEstimateResponse = {
  estimated_rows: number;
  took_ms: number;
  warnings: string[];
};

export type FacetRequest = {
  field: string;
  limit?: number;
  order_by?: "count_desc" | "value_asc";
};

export type SearchFacetsRequest = {
  tenant_id: string;
  time: TimeRange;
  q: string;
  facets: FacetRequest[];
};

export type SearchFacetsResponse = {
  facets: Record<string, Array<{ value: string; count: number }>>;
  took_ms: number;
  warnings: string[];
};

export type SearchTimelineRequest = {
  tenant_id: string;
  time: TimeRange;
  q: string;
  interval_ms: number;
};

export type SearchTimelineResponse = {
  buckets: Array<{ t: number; count: number }>;
  took_ms: number;
};

// Streaming types
export type SearchTailRequest = {
  tenant_id: string;
  time: TimeRange;
  q: string;
  select?: string[];
  stream_id: string;
};

export type TailEvent = 
  | { type: "hello"; data: { stream_id: string; started_at: number } }
  | { type: "row"; data: any }
  | { type: "stats"; data: { rows: number; bytes: number; elapsed_ms: number } }
  | { type: "watermark"; data: { ts: number } }
  | { type: "warning"; data: { message: string } };

// Schema types
export type SchemaFieldsResponse = {
  fields: FieldMeta[];
  took_ms: number;
};

export type SchemaEnumsResponse = {
  enums: Record<string, string[]>;
};

export type SearchGrammarResponse = {
  keywords: string[];
  operators: string[];
  functions: string[];
  specials: string[];
};

// Saved search types
export type SavedSearch = {
  saved_search_id: string;
  tenant_id: string;
  name: string;
  q: string;
  time: TimeRange;
  select?: string[];
  sort?: Sort[];
  owner: string;
  shared_with?: string[];
  created_at: number;
  updated_at: number;
};

export type CreateSavedSearchRequest = Omit<SavedSearch, "saved_search_id" | "created_at" | "updated_at">;

export type UpdateSavedSearchRequest = Partial<CreateSavedSearchRequest>;

export type SavedSearchesResponse = {
  items: SavedSearch[];
  next_cursor: string | null;
};

// Pin types
export type Pin = {
  pin_id: string;
  tenant_id: string;
  saved_search_id: string;
  created_at: number;
};

// Template types
export type SearchTemplate = {
  template_id: string;
  name: string;
  q: string;
  doc: string;
  defaults?: {
    time?: TimeRange;
    select?: string[];
    sort?: Sort[];
  };
  created_at: number;
  updated_at: number;
};

// History types
export type SearchHistoryItem = {
  history_id: string;
  tenant_id: string;
  q: string;
  time: TimeRange;
  executed_at: number;
  result_count?: number;
};

// Export types
export type ExportFormat = "csv" | "ndjson" | "parquet";

export type CreateExportRequest = {
  tenant_id: string;
  time: TimeRange;
  q: string;
  select?: string[];
  format: ExportFormat;
  max_rows?: number;
};

export type Export = {
  export_id: string;
  status: "queued" | "processing" | "ready" | "failed";
  download_url?: string;
  rows?: number;
  error?: string;
  created_at: number;
};

// Autocomplete types
export type SuggestFieldsResponse = {
  items: string[];
};

export type SuggestValuesResponse = {
  items: string[];
};

export type SuggestTokensResponse = {
  items: string[];
};

// Error response
export type ErrorResponse = {
  error: string;
  code: string;
  details?: any;
  request_id?: string;
};
