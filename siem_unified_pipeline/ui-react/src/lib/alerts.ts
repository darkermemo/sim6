import { apiFetch } from './api';

// Types
export type AlertStatus = 'OPEN' | 'ACK' | 'CLOSED' | 'SUPPRESSED';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type Alert = {
  tenant_id: number;
  alert_id: string;
  rule_id: string;
  created_at: string; // ISO
  event_timestamp?: string;
  severity: Severity;
  status: AlertStatus;
  title: string;
  summary?: string;
  alert_key?: string;
  dedupe_hash?: string | number;
  source?: string;
  user?: string;
  src_ip?: string;
  dst_ip?: string;
  host?: string;
  // drawer data (from /alerts/:id)
  event?: Record<string, unknown>;
  fields?: Record<string, string | number | boolean>;
  tags?: string[];
};

export type AlertsListReq = {
  tenant_id: number;
  q?: string;               // field:value AND …
  statuses?: AlertStatus[]; // default: OPEN,ACK
  severities?: Severity[];  // default: all
  rule_ids?: string[];
  time?: { last_seconds: number } | { from: string; to: string };
  limit?: number;           // default 100, max 1000
  cursor?: string;          // server-provided next cursor
  sort?: 'created_at' | 'severity';
  dir?: 'asc' | 'desc';
};

export type AlertsListRes = {
  meta: { took_ms: number; row_count: number; next_cursor?: string };
  data: Alert[];
};

export type AlertGetRes = Alert & {
  notes?: AlertNote[];
};

export type AlertPatchReq = Partial<Pick<Alert, 'status'>> & {
  assignee?: string | null;
  add_tags?: string[];
  remove_tags?: string[];
};

export type AlertPatchRes = { updated: boolean };

export type AlertNote = {
  note_id?: string;
  author?: string;
  created_at?: string;
  body: string;
};

export type AddNoteReq = { body: string };
export type AddNoteRes = { note_id: string; created_at: string };

// API client
export const alertsApi = {
  list: async (req: AlertsListReq, signal?: AbortSignal): Promise<AlertsListRes> => {
    // Support both GET with query params and POST with body
    // Backend might expect POST for complex queries
    try {
      return await apiFetch<AlertsListRes>('/alerts', {
        method: 'POST',
        body: JSON.stringify(req),
        headers: req.tenant_id ? { 'x-tenant-id': String(req.tenant_id) } : undefined,
        signal,
      });
    } catch (error) {
      // Fallback to GET if POST fails
      const params = new URLSearchParams();
      Object.entries(req).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            params.append(key, value.join(','));
          } else if (typeof value === 'object') {
            params.append(key, JSON.stringify(value));
          } else {
            params.append(key, String(value));
          }
        }
      });
      return await apiFetch<AlertsListRes>(`/alerts?${params.toString()}`, {
        headers: req.tenant_id ? { 'x-tenant-id': String(req.tenant_id) } : undefined,
        signal,
      });
    }
  },

  get: async (id: string, tenantId?: number, signal?: AbortSignal): Promise<AlertGetRes> => {
    return await apiFetch<AlertGetRes>(`/alerts/${id}`, {
      headers: tenantId ? { 'x-tenant-id': String(tenantId) } : undefined,
      signal,
    });
  },

  patch: async (id: string, req: AlertPatchReq, tenantId?: number): Promise<AlertPatchRes> => {
    return await apiFetch<AlertPatchRes>(`/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
      headers: tenantId ? { 'x-tenant-id': String(tenantId) } : undefined,
    });
  },

  addNote: async (id: string, req: AddNoteReq, tenantId?: number): Promise<AddNoteRes> => {
    return await apiFetch<AddNoteRes>(`/alerts/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify(req),
      headers: tenantId ? { 'x-tenant-id': String(tenantId) } : undefined,
    });
  },
};

// Helper functions
export function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'CRITICAL': return 'red';
    case 'HIGH': return 'orange';
    case 'MEDIUM': return 'yellow';
    case 'LOW': return 'blue';
    case 'INFO': return 'gray';
    default: return 'gray';
  }
}

export function getStatusColor(status: AlertStatus): string {
  switch (status) {
    case 'OPEN': return 'red';
    case 'ACK': return 'yellow';
    case 'CLOSED': return 'green';
    case 'SUPPRESSED': return 'gray';
    default: return 'gray';
  }
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  if (diffSecs > 0) return `${diffSecs}s ago`;
  return 'just now';
}
