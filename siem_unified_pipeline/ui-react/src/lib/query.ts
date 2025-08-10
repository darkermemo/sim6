import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Admin, Schema, SearchApi } from './api'

export function useTenants(){
  return useQuery({ queryKey:['tenants'], queryFn: Admin.listTenants })
}
export function useTenantLimits(id:string){
  return useQuery({ queryKey:['tenant-limits', id], queryFn:()=>Admin.getTenantLimits(id), enabled:!!id })
}
export function useUpdateTenantLimits(id:string){
  const qc = useQueryClient()
  return useMutation({
    mutationFn:(b:{eps_limit:number;burst_limit:number;retention_days:number}) => Admin.putTenantLimits(id,b),
    onSuccess:()=> qc.invalidateQueries({ queryKey:['tenant-limits', id]})
  })
}

export function useSchemaFields(){
  return useQuery({ queryKey:['schema-fields'], queryFn: Schema.listFields })
}

export function useFacetSuggestions(dsl:any, field:string, prefix:string){
  return useQuery({ queryKey:['facet', dsl, field, prefix], queryFn: ()=> SearchApi.facetSuggestions(dsl, field, 20), enabled: (!!dsl && !!field && prefix.length>0) })
}

export function useCompileDsl(dsl:any){
  return useQuery({ queryKey:['compile', dsl], queryFn: ()=> SearchApi.compile(dsl), enabled: !!dsl })
}

export function useLatestEvents(tenants:string[] = ['default'], limit=200){
  return useQuery({
    queryKey:['latest-events', tenants, limit],
    queryFn: ()=> SearchApi.execute({ search: { tenant_ids: tenants, time_range: { last_seconds: 86400 }, where: null, limit } }),
    staleTime: 10_000,
  })
}


