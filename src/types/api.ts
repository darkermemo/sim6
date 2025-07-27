// Log Source Management Types (from siem_api/src/log_source_handlers.rs)
export interface LogSource {
  source_id: string;
  tenant_id: string;
  source_name: string;
  source_type: LogSourceType;
  source_ip: string;
  created_at: number;
}

export type LogSourceType = "Syslog" | "JSON" | "Windows" | "Apache" | "Nginx";

export interface CreateLogSourceRequest {
  source_name: string;
  source_type: LogSourceType;
  source_ip: string;
}

export interface CreateLogSourceResponse {
  source_id: string;
  message: string;
}

export interface LogSourceListResponse {
  log_sources: LogSource[];
  total: number;
}

export interface LogSourceLookupResponse {
  source_type: string;
  source_name: string;
}

export interface LogSourceFilters {
  search?: string;
  source_type?: LogSourceType;
  page?: number;
  limit?: number;
} 