import { http } from '@/lib/http';

// Minimal Search UI connector that maps driver calls to our proxy API
// Only methods we intend to use in the PoC are implemented

export interface ExecuteParams {
  q: string;
  tenant_id: string;
  last_seconds: number;
  page: number;
  size: number;
}

export async function execute({ q, tenant_id, last_seconds, page, size }: ExecuteParams) {
  const offset = (page - 1) * size;
  const body = {
    tenant_id,
    time: { last_seconds },
    q: q || '',
    limit: size,
    offset,
    order: [{ field: 'ts', dir: 'desc' }],
  } as const;

  return http<any>('/search/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

export async function fetchFacets(q: string, tenant_id: string, last_seconds: number, facets: Array<{ field: string; size?: number }>) {
  return http<any>('/search/facets', {
    method: 'POST',
    body: JSON.stringify({ tenant_id, time: { last_seconds }, q: q || '', facets }),
    headers: { 'content-type': 'application/json' },
  });
}

export async function fetchValues(field: string, tenant_id: string, prefix?: string, limit = 20) {
  const params = new URLSearchParams({ tenant_id, field, limit: String(limit) });
  if (prefix) params.set('prefix', prefix);
  return http<any>(`/search/values?${params.toString()}`);
}


