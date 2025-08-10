import { z } from 'zod'

const BASE = import.meta.env.VITE_API_BASE ?? ''
export const TenantsSchema = z.object({ tenants: z.array(z.object({ id: z.string(), name: z.string().optional() })) })

export async function api<T>(path:string, init?:RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { 'content-type':'application/json', ...(init?.headers||{}) } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}
export const Admin = {
  async listTenants(): Promise<{tenants:{id:string}[]}> {
    const j = await api<any>('/api/v2/admin/tenants')
    const arr = Array.isArray(j) ? j : (j.items || [])
    const tenants = arr.map((t:any) => ({ id: t.tenant_id || t.id || t }))
    return { tenants }
  },
  getTenantLimits: (id:string) => api<{eps_limit:number;burst_limit:number;retention_days:number}>(`/api/v2/admin/tenants/${id}/limits`),
  putTenantLimits: (id:string, body:{eps_limit:number;burst_limit:number;retention_days:number}) =>
    api<{ok:true}>(`/api/v2/admin/tenants/${id}/limits`, { method:'PUT', body: JSON.stringify(body) }),
}

export const Schema = {
  async listFields(): Promise<{ name: string }[]> {
    const j = await api<any>('/api/v2/schema/fields')
    // backend may return {fields:[{name:..}]} or simple array
    const arr = j?.fields ?? j ?? []
    return arr.map((f:any) => (typeof f === 'string' ? { name: f } : { name: f.name || '' })).filter((f:any)=>f.name)
  },
}

export const SearchApi = {
  async facetSuggestions(dsl: any, field: string, k = 20): Promise<string[]> {
    // Backend expects { dsl, field, k }
    const body = { dsl, field, k }
    const j = await api<any>('/api/v2/search/facets', { method: 'POST', body: JSON.stringify(body) })
    const topk = j?.topk ?? []
    return (Array.isArray(topk) ? topk : []).map((row:any) => Array.isArray(row) ? (row[0] ?? '') : (row.v ?? row.value ?? '')).filter(Boolean)
  },
  async compile(dsl:any): Promise<string>{
    const j = await api<any>('/api/v2/search/compile', { method:'POST', body: JSON.stringify(dsl) })
    return j?.sql || j?.where_sql || ''
  },
  async execute(dsl: any): Promise<{ sql: string; rows: any[] }>{
    const j = await api<any>('/api/v2/search/execute', { method:'POST', body: JSON.stringify({ dsl }) })
    const rows = j?.data?.data ?? []
    return { sql: j?.sql ?? '', rows }
  }
}


