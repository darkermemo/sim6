import { apiFetch } from './api';

export interface RulePack {
  pack_id: string;
  name: string;
  version: string;
  source: string;
  uploaded_at: string;
  uploader: string;
  items: number;
  sha256: string;
}

export interface RulePackItem {
  pack_id: string;
  item_id: string;
  kind: string;
  rule_id: string;
  name: string;
  severity: string;
  tags: string[];
  body: string;
  sha256: string;
  compile_result: any;
}

export interface UploadResponse {
  pack_id: string;
  items: number;
  sha256: string;
  errors: UploadError[];
}

export interface UploadError {
  item_id: string;
  rule_id: string;
  error: string;
}

export interface PlanRequest {
  strategy: 'safe' | 'force';
  match_by: 'rule_id' | 'name';
  tag_prefix?: string;
}

export interface PlanResponse {
  plan_id: string;
  totals: DeploySummary;
  entries: PlanEntry[];
  guardrails: GuardrailStatus;
}

export interface DeploySummary {
  create: number;
  update: number;
  disable: number;
  skip: number;
}

export interface PlanEntry {
  action: 'CREATE' | 'UPDATE' | 'DISABLE' | 'SKIP';
  rule_id: string;
  name: string;
  from_sha?: string;
  to_sha?: string;
  warnings: string[];
}

export interface GuardrailStatus {
  compilation_clean: boolean;
  hot_disable_safe: boolean;
  quota_ok: boolean;
  blast_radius_ok: boolean;
  health_ok: boolean;
  lock_ok: boolean;
  idempotency_ok: boolean;
  blocked_reasons: string[];
}

export interface CanaryConfig {
  enabled: boolean;
  stages: number[]; // [10, 25, 50, 100]
  interval_sec: number; // Minimum 30s
}

export interface ApplyRequest {
  plan_id: string;
  dry_run?: boolean;
  actor: string;
  canary?: CanaryConfig;
  force?: boolean;
  force_reason?: string;
}

export interface ApplyResponse {
  deploy_id: string;
  summary: DeploySummary;
  totals: DeploySummary;
  errors: string[];
  replayed: boolean;
  guardrails: string[];
  canary?: CanaryStatus;
}

export interface CanaryStatus {
  enabled: boolean;
  current_stage: number;
  stages: number[];
  state: 'running' | 'paused' | 'failed' | 'completed';
}

export interface RollbackRequest {
  reason?: string;
}

export interface RollbackResponse {
  rollback_deploy_id: string;
  original_deploy_id: string;
  summary: DeploySummary;
  totals: DeploySummary;
}

export interface CanaryControlRequest {
  action: 'advance' | 'pause' | 'cancel';
}

export interface CanaryControlResponse {
  deploy_id: string;
  canary_state: string;
  current_stage: number;
  message: string;
}

export interface Deployment {
  deploy_id: string;
  pack_id: string;
  started_at: string;
  finished_at?: string;
  status: 'PLANNED' | 'APPLIED' | 'FAILED' | 'CANCELED' | 'ROLLED_BACK';
  summary: string;
  created: number;
  updated: number;
  disabled: number;
  skipped: number;
  errors: number;
  guardrails: string;
  canary: number;
  canary_stages: number;
  canary_current_stage: number;
  canary_state: string;
  rolled_back_from: string;
  rolled_back_to: string;
  force_reason: string;
  blast_radius: number;
}

export interface DeploymentArtifact {
  kind: 'plan' | 'apply' | 'rollback' | 'canary';
  content: string;
  created_at: string;
}

export const rulePacksApi = {
  upload: async (file: File, metadata: { name: string; uploader?: string }): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', metadata.name);
    if (metadata.uploader) formData.append('uploader', metadata.uploader);

    return apiFetch('/rule-packs/upload', {
      method: 'POST',
      body: formData,
    });
  },

  plan: async (packId: string, request: PlanRequest): Promise<PlanResponse> => {
    return apiFetch(`/rule-packs/${packId}/plan`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  apply: async (packId: string, request: ApplyRequest): Promise<ApplyResponse> => {
    return apiFetch(`/rule-packs/${packId}/apply`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  list: async (): Promise<RulePack[]> => {
    return apiFetch('/rule-packs');
  },

  get: async (packId: string): Promise<RulePack> => {
    return apiFetch(`/rule-packs/${packId}`);
  },

  rollback: async (deployId: string, request: RollbackRequest): Promise<RollbackResponse> => {
    return apiFetch(`/rule-packs/deployments/${deployId}/rollback`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  canaryControl: async (deployId: string, action: 'advance' | 'pause' | 'cancel'): Promise<CanaryControlResponse> => {
    return apiFetch(`/rule-packs/deployments/${deployId}/canary/${action}`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },

  getArtifacts: async (deployId: string): Promise<DeploymentArtifact[]> => {
    return apiFetch(`/rule-packs/deployments/${deployId}/artifacts`);
  },
};

// Utility function for formatting file sizes
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Utility function to get color for action types
export function getActionColor(action: PlanEntry['action']): string {
  switch (action) {
    case 'CREATE':
      return 'green';
    case 'UPDATE':
      return 'blue';
    case 'DISABLE':
      return 'red';
    case 'SKIP':
      return 'gray';
    default:
      return 'gray';
  }
}
