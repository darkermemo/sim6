import type { HealthSummary, HealthDelta, DiagnoseRequest, DiagnoseResponse, AutoFixRequest, AutoFixResponse } from '@/types/health';
import { http } from '@/lib/http';

export async function getHealthSummary(signal?: AbortSignal): Promise<HealthSummary> {
  return http<HealthSummary>('/health/summary', { signal });
}

export function openHealthStream(onMessage: (delta: HealthDelta) => void): () => void {
  const BASE = process.env.NEXT_PUBLIC_BASEPATH || '';
  const streamUrl = `${BASE}/api/v2/health/stream`;
  const es = new EventSource(streamUrl);
  es.onmessage = (ev) => {
    try { 
      onMessage(JSON.parse(ev.data)); 
    } catch (e) {
      console.warn('Failed to parse SSE message:', e);
    }
  };
  es.onerror = (err) => { 
    console.warn('SSE error:', err);
    // Let the browser retry automatically
  };
  return () => es.close();
}

export async function diagnoseComponent(req: DiagnoseRequest): Promise<DiagnoseResponse> {
  return http<DiagnoseResponse>('/health/diagnose', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req)
  });
}

export async function executeAutoFix(req: AutoFixRequest): Promise<AutoFixResponse> {
  return http<AutoFixResponse>('/health/autofix', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req)
  });
}

export async function getHealthErrors() {
  return http<any[]>('/health/errors');
}

export async function getHealthExecutions() {
  return http<any[]>('/health/executions');
}

export async function getHealthExecution(id: string) {
  return http<any>(`/health/executions/${id}`);
}