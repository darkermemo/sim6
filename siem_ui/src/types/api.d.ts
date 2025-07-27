// Authentication API Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  tenant_id: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

// Dashboard API Types
export interface KpiData {
  total_events: number;
  new_alerts: number;
  cases_opened: number;
  eps: number;
}

export interface TrendData {
  total_events: number;
  new_alerts: number;
  cases_opened: number;
  eps: number;
}

export interface AlertsOverTimeData {
  hour: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface TopLogSourceData {
  source: string;
  count: number;
}

export interface RecentAlert {
  alert_id: string;
  rule_name: string;
  severity: string;
  timestamp: number;
  source_ip: string | null;
  dest_ip: string | null;
  user: string | null;
}

export interface DashboardResponse {
  kpi_data: KpiData;
  trend_data: TrendData;
  alerts_over_time: AlertsOverTimeData[];
  top_log_sources: TopLogSourceData[];
  recent_alerts: RecentAlert[];
}

export interface DashboardFilters {
  from?: string;
  to?: string;
  severity?: string;
  limit?: number;
}

// Alert API Types
export interface Alert {
  alert_id: string;
  tenant_id: string;
  rule_id: string;
  rule_name: string;
  event_id: string;
  alert_timestamp: number;
  severity: string;
  status: string;
  created_at: number;
}

export interface AlertDetail {
  alert_id: string;
  tenant_id: string;
  rule_id: string;
  rule_name: string;
  event_id: string;
  alert_timestamp: number;
  severity: string;
  status: string;
  assignee_id: string | null;
  created_at: number;
  raw: string;
  src_ip: string | null;
  dest_ip: string | null;
  user: string | null;
  cmdline: string | null;
  hash: string | null;
  mitre_tags: string[];
}

export interface UpdateAlertStatusRequest {
  status: string;
}

export interface UpdateAlertAssigneeRequest {
  assignee_id: string | null;
}

export interface AlertNote {
  note_id: string;
  alert_id: string;
  tenant_id: string;
  author: string;
  content: string;
  created_at: number;
}

export interface CreateAlertNoteRequest {
  content: string;
}

export interface CreateAlertRequest {
  alerts: Alert[];
}

// Case Management API Types
export interface Case {
  case_id: string;
  tenant_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCaseRequest {
  title: string;
  description?: string;
  priority: string;
  alert_ids: string[];
}

export interface UpdateCaseRequest {
  status?: string;
  assigned_to?: string;
}

export interface Asset {
  asset_id: string;
  asset_name: string;
  asset_ip: string;
  asset_type: string;
  criticality: string;
}

export interface CaseWithEvidence {
  case_id: string;
  tenant_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  alert_ids: string[];
  related_assets: Asset[];
}

export interface CreateCaseResponse {
  case_id: string;
  message: string;
}

// Admin API Types
export interface CreateUserRequest {
  user_id: string;
  tenant_id: string;
  email: string;
  roles: string[];
}

export interface UserResponse {
  user_id: string;
  tenant_id: string;
  email: string;
  is_active: boolean;
  roles: string[];
}

export interface AssignRoleRequest {
  role_name: string;
}

export interface User {
  user_id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  is_active: number;
  created_at: number;
}

export interface Role {
  role_id: string;
  role_name: string;
  description: string;
}

export interface UserRole {
  user_id: string;
  tenant_id: string;
  role_name: string;
}

// Common API Response Types
export interface ApiError {
  error: string;
}

export interface ApiMessage {
  message: string;
}