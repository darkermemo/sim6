import { apiFetch } from './api';

// Types
export type RuleKind = 'NATIVE' | 'SIGMA';

export type Rule = {
  rule_id: string;
  tenant_id: number;
  name: string;
  description?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  enabled: boolean;
  kind: RuleKind;
  // NATIVE
  dsl?: string;            // our query DSL / KQL-like
  // SIGMA
  sigma_yaml?: string;     // raw YAML
  // Watermark & safety
  watermark_sec?: number;  // default 120
  throttle_seconds?: number; // dedupe suppression
  // Keys
  alert_key?: string;      // expression like coalesce(user, src_ip, host)
  // Meta
  created_at?: string;
  updated_at?: string;
  tags?: string[];
};

export type RulesListReq = {
  tenant_id: number;
  q?: string;            // name:foo tags:bar enabled:true kind:NATIVE
  limit?: number;        // clamp 1000
  cursor?: string;
  sort?: 'updated_at' | 'severity' | 'name';
  dir?: 'asc' | 'desc';
};

export type RulesListRes = { 
  data: Rule[]; 
  meta: {
    row_count: number; 
    next_cursor?: string; 
    took_ms: number;
  };
};

export type CompileReq = { 
  tenant_id: number; 
  kind: RuleKind; 
  dsl?: string; 
  sigma_yaml?: string; 
};

export type CompileRes = { 
  ok: boolean; 
  sql?: string; 
  warnings?: string[]; 
  errors?: {
    line?: number; 
    message: string;
  }[];
};

export type DryRunReq = { 
  tenant_id: number; 
  last_seconds: number; 
  limit?: number; 
};

export type DryRunRes = { 
  rows: number; 
  sample?: any[]; 
  took_ms: number; 
};

export type RunNowReq = { 
  tenant_id: number; 
  idempotency_key: string; 
};

export type RunNowRes = { 
  alerts_written: number; 
  replayed?: boolean; 
  took_ms: number; 
};

// API client
export const rulesApi = {
  list: async (req: RulesListReq, signal?: AbortSignal): Promise<RulesListRes> => {
    return await apiFetch<RulesListRes>('/alert_rules', {
      method: 'GET',
      headers: { 'x-tenant-id': String(req.tenant_id) },
      signal,
    });
  },

  create: async (rule: Omit<Rule, 'rule_id'>, tenantId: number): Promise<Rule> => {
    return await apiFetch<Rule>('/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
      headers: { 'x-tenant-id': String(tenantId) },
    });
  },

  get: async (id: string, tenantId: number, signal?: AbortSignal): Promise<Rule> => {
    return await apiFetch<Rule>(`/rules/${id}`, {
      headers: { 'x-tenant-id': String(tenantId) },
      signal,
    });
  },

  update: async (id: string, rule: Partial<Rule>, tenantId: number): Promise<Rule> => {
    return await apiFetch<Rule>(`/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(rule),
      headers: { 'x-tenant-id': String(tenantId) },
    });
  },

  delete: async (id: string, tenantId: number): Promise<void> => {
    await apiFetch(`/rules/${id}`, {
      method: 'DELETE',
      headers: { 'x-tenant-id': String(tenantId) },
    });
  },

  compile: async (req: CompileReq): Promise<CompileRes> => {
    return await apiFetch<CompileRes>('/rules/sigma/compile', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  dryRun: async (id: string, req: DryRunReq): Promise<DryRunRes> => {
    return await apiFetch<DryRunRes>(`/rules/${id}/dry-run`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  runNow: async (id: string, req: RunNowReq): Promise<RunNowRes> => {
    return await apiFetch<RunNowRes>(`/rules/${id}/run-now`, {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },
};

// Helper functions
export function generateIdempotencyKey(): string {
  // Generate a unique key using timestamp and random component
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `rule-run-${timestamp}-${random}`;
}

export function validateRuleName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Rule name is required';
  }
  if (name.length < 3) {
    return 'Rule name must be at least 3 characters';
  }
  if (name.length > 120) {
    return 'Rule name must be at most 120 characters';
  }
  return null;
}

export function validateWatermarkSec(value: number): string | null {
  if (value < 60) {
    return 'Watermark must be at least 60 seconds';
  }
  if (value > 900) {
    return 'Watermark must be at most 900 seconds (15 minutes)';
  }
  return null;
}

export function validateThrottleSeconds(value: number): string | null {
  if (value < 0) {
    return 'Throttle seconds cannot be negative';
  }
  if (value > 3600) {
    return 'Throttle seconds must be at most 3600 (1 hour)';
  }
  return null;
}

export function validateAlertKey(key: string): string | null {
  if (!key || key.trim().length === 0) {
    return 'Alert key expression is required';
  }
  // Basic validation - could be enhanced
  const validPattern = /^[a-zA-Z0-9_,\s()]+$/;
  if (!validPattern.test(key)) {
    return 'Alert key contains invalid characters';
  }
  return null;
}
