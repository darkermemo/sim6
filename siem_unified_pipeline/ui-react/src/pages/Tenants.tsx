import { useState } from 'react'
import { useTenants, useTenantLimits, useUpdateTenantLimits } from '../lib/query'

export default function TenantsPage(){
  const { data, isLoading } = useTenants()
  const [sel, setSel] = useState<string>('default')
  const lim = useTenantLimits(sel)
  const upd = useUpdateTenantLimits(sel)

  if(isLoading) return <div>Loading tenants…</div>

  return (
    <div>
      <h1>Tenants</h1>
      <div className="card">
        <div>
          {data?.tenants?.map((t:{id:string}) => (
            <span key={t.id} className={`chip ${sel===t.id?'active':''}`} onClick={()=>setSel(t.id)}>{t.id}</span>
          ))}
        </div>

        {lim.data && (
          <form className="form-grid" onSubmit={(e)=>{e.preventDefault()
            const form = new FormData(e.currentTarget as HTMLFormElement)
            upd.mutate({
              eps_limit: Number(form.get('eps_limit')||0),
              burst_limit: Number(form.get('burst_limit')||0),
              retention_days: Number(form.get('retention_days')||0),
            })
          }}>
            <label>EPS Limit<input id="eps_limit" name="eps_limit" defaultValue={lim.data.eps_limit} placeholder="e.g. 50"/></label>
            <label>Burst Limit<input id="burst_limit" name="burst_limit" defaultValue={lim.data.burst_limit} placeholder="e.g. 100"/></label>
            <label>Retention (days)<input id="retention_days" name="retention_days" defaultValue={lim.data.retention_days} placeholder="e.g. 30"/></label>
            <div><button className="btn primary" type="submit" disabled={upd.isPending}>{upd.isPending?'Saving…':'Save limits'}</button></div>
          </form>
        )}
      </div>
    </div>
  )
}


