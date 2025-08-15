/**
 * Golden Standard Search Types
 * Complete type definitions for Search page
 */

export type TimeRange = { 
  last_seconds?: number; 
  from?: number; 
  to?: number;
};

export type SortSpec = { 
  field: string; 
  dir: "asc" | "desc";
};

export type CompileResult = { 
  sql: string; 
  where_sql?: string; 
  warnings: string[];
};

export type ExecuteResult = {
  data: { 
    data: any[]; 
    meta: { name: string; type: string }[]; 
    rows: number; 
    rows_before_limit_at_least: number; 
    statistics: any;
  };
  sql: string; 
  took_ms: number; 
  warnings?: string[];
};

export type FacetBucket = { 
  value: string; 
  count: number;
};

export type TimelineBucket = { 
  t: number; 
  count: number;
};

export interface SearchState {
  tenantId: string;
  query: string;
  time: TimeRange;
  limit: number;
  sort: SortSpec[];
  compile?: CompileResult;
  execute?: ExecuteResult;
  facets?: Record<string, FacetBucket[]>;
  timeline?: TimelineBucket[];
  sse: { 
    enabled: boolean; 
    connected: boolean; 
    lastEventTs?: number;
  };
  saving: boolean;
  exporting: boolean;
  errors: string[];
}

// Schema types
export type FieldMeta = {
  name: string;
  type: string;
  doc?: string;
  searchable: boolean;
  facetable: boolean;
  sortable: boolean;
};

export type Grammar = {
  tokens: { label: string; example?: string }[];
  functions: string[];
  examples: string[];
  keywords: string[];
  operators: string[];
  specials: string[];
};

// Saved search types
export type SavedSearch = {
  saved_id: string;
  tenant_id: string;
  name: string;
  q: string;
  time: TimeRange;
  options?: {
    limit?: number;
    sort?: SortSpec[];
  };
  created_at: number;
  updated_at: number;
};

// Export types
export type ExportFormat = "csv" | "ndjson" | "parquet";

export type Export = {
  export_id: string;
  status: "queued" | "processing" | "ready" | "failed";
  download_url?: string;
  error?: string;
  created_at: number;
};

// API error type
export type ApiError = {
  error: string;
  code: string;
  details?: any;
  request_id?: string;
};
