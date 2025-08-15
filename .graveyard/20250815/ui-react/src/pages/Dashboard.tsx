import { useEffect, useMemo, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'

async function fetchText(url:string){ try{ const r=await fetch(url); return await r.text(); }catch{ return ''} }
async function fetchJson<T=any>(url:string){ try{ const r=await fetch(url); return await r.json() as T; }catch{ return {} as any } }

function parsePrometheus(lines:string, name:string){
  const out:{labels:Record<string,string>, value:number}[]=[]
  lines.split('\n').forEach(l=>{
    if(!l.startsWith(name)) return
    const m = l.match(/^([^\{]+)(\{[^}]*\})?\s+([0-9.]+)/)
    if(!m) return
    const labelsStr = m[2]||''
    const labels:Record<string,string>={}
    labelsStr.replace(/[{}]/g,'').split(',').filter(Boolean).forEach(p=>{ const [k,v]=p.split('='); if(k) labels[k]=String(v||'').replace(/^"|"$/g,'') })
    const value = parseFloat(m[3]||'0')
    out.push({labels, value})
  })
  return out
}

export default function Dashboard(){
  const [tenant, setTenant] = useState('default')
  const [range, setRange] = useState('1h')
  const [health, setHealth] = useState<any>({})
  const [metrics, setMetrics] = useState<string>('')
  const [alerts, setAlerts] = useState<any[]>([])
  const [epsSeries, setEpsSeries] = useState<{t:string,v:number}[]>([])
  const [quick, setQuick] = useState<{ total_events?: number }>({})
  const [streamStatus, setStreamStatus] = useState<{ stream_len?: number; lag_ms?: number; consumers?: any[] }>({})
  const prevEnq = useRef<number | null>(null)
  const prevAck = useRef<number | null>(null)
  const [enqPerSec, setEnqPerSec] = useState(0)
  const [ackPerSec, setAckPerSec] = useState(0)

  useEffect(()=>{ (async()=>{
    setHealth(await fetchJson('/api/v2/health'))
    try{ const j = await fetch(`/api/v2/alerts?limit=50`).then(r=>r.json()); setAlerts(j.alerts||[]) }catch{}
  })() }, [tenant, range])

  // Real EPS poll (no mocks): sample /api/v2/metrics/eps current_eps (per-tenant if available)
  useEffect(()=>{
    let mounted = true
    const tick = async ()=>{
      try{
        const windowSec = range === '1h' ? 3600 : range === '24h' ? 86400 : range === '7d' ? 604800 : 3600
        const j:any = await fetchJson(`/api/v2/metrics/eps?window_seconds=${windowSec}`)
        const per = j?.per_tenant?.tenants || {}
        const cur = (per && per[tenant]?.current_eps) ?? j?.global?.current_eps ?? 0
        const t = new Date().toLocaleTimeString()
        if(!mounted) return
        setEpsSeries(prev => {
          const next = [...prev, { t, v: Number(cur)||0 }]
          // keep last 60 points
          return next.slice(-60)
        })
      }catch{ /* ignore transient */ }
      try{
        // metrics for deltas + streaming status + quick stats
        const [mTxt, stJson, qJson] = await Promise.all([
          fetchText('/metrics'),
          fetchJson(`/api/v2/admin/streaming/status?tenant_id=${encodeURIComponent(tenant)}`),
          fetchJson('/api/v2/metrics/quick'),
        ])
        if(!mounted) return
        setMetrics(mTxt)
        setStreamStatus(stJson || {})
        setQuick(qJson || {})
        const enq = sumMetric(mTxt, 'siem_v2_stream_enqueue_total')
        const ack = sumMetric(mTxt, 'siem_v2_stream_ack_total')
        if(prevEnq.current != null) setEnqPerSec(Math.max(0, (enq - prevEnq.current) / 5))
        if(prevAck.current != null) setAckPerSec(Math.max(0, (ack - prevAck.current) / 5))
        prevEnq.current = enq
        prevAck.current = ack
      }catch{ /* ignore */ }
    }
    // prime + interval
    tick()
    const id = setInterval(tick, 5000)
    return ()=>{ mounted=false; clearInterval(id) }
  }, [tenant, range])

  const ingest = quick?.total_events ?? 0
  const rateLimit = useMemo(()=> parsePrometheus(metrics, 'siem_v2_rate_limit_total').reduce((a,b)=>a+b.value,0), [metrics])
  const openAlerts = useMemo(()=> (alerts||[]).filter((a:any)=> (a.status||'OPEN')==='OPEN').length, [alerts])

  const lag = streamStatus?.lag_ms ?? parsePrometheus(metrics, 'siem_v2_stream_lag_ms').reduce((a,b)=>a+b.value,0)
  // acks is computed via per-second deltas; total kept implicitly via parse on demand
  const evalErrors = useMemo(()=> parsePrometheus(metrics, 'siem_v2_stream_eval_errors_total').reduce((a,b)=>a+b.value,0), [metrics])
  const backpressure = useMemo(()=> parsePrometheus(metrics, 'siem_v2_stream_backpressure_total').reduce((a,b)=>a+b.value,0), [metrics])

  const epsData = epsSeries

  const bySeverity = useMemo(()=>{
    const sev=['CRITICAL','HIGH','MEDIUM','LOW']
    const counts:Record<string,number> = { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0 };
    (alerts||[]).forEach((a:any)=>{ const s=(a.severity||'').toUpperCase(); if(Object.prototype.hasOwnProperty.call(counts, s)) counts[s] = (counts[s]||0)+1 })
    return sev.map(s=>({name:s, count: counts[s]}))
  }, [alerts])

  return (
    <div>
      <div className="card" style={{marginBottom:12}}>
        <div style={{display:'flex', gap:12, alignItems:'center', justifyContent:'space-between'}}>
          <div style={{display:'flex', gap:12, alignItems:'center'}}>
            <h1>Dashboard</h1>
            <span className="chip">API: {health?.status||'?'}</span>
            <span className="chip">CIDR: {health?.cidr_fn||'?'}</span>
            <span className="chip">Redis: {(health?.redis||'down')}</span>
          </div>
          <div style={{display:'flex', gap:12, alignItems:'center'}}>
            <label>Tenant<select value={tenant} onChange={(e)=>setTenant(e.target.value)}><option>default</option></select></label>
            <label>Range<select value={range} onChange={(e)=>setRange(e.target.value)}>
              <option value="1h">Last 1h</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7d</option>
            </select></label>
            <button className="btn" onClick={()=>{ setHealth({}); setMetrics(''); setAlerts([]); setTimeout(()=>{ (async()=>{
              setHealth(await fetchJson('/api/v2/health')); setMetrics(await fetchText('/metrics')); try{ const j = await fetch(`/api/v2/alerts?limit=20`).then(r=>r.json()); setAlerts(j.alerts||[]) }catch{}
            })()}, 0) }}>Refresh</button>
          </div>
        </div>
      </div>

      <div className="card" style={{marginBottom:12}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12}}>
          <div className="card"><div>Events</div><div style={{fontSize:24,fontWeight:700}}>{ingest}</div></div>
          <div className="card"><div>Rate limited</div><div style={{fontSize:24,fontWeight:700}}>{rateLimit}</div></div>
          <div className="card"><div>Stream enq/s</div><div style={{fontSize:24,fontWeight:700}}>{enqPerSec.toFixed(2)}</div></div>
          <div className="card"><div>Open alerts</div><div style={{fontSize:24,fontWeight:700}}>{openAlerts}</div></div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:12}}>
        <div className="card" style={{height:260}}>
          <div style={{marginBottom:8, fontWeight:600}}>EPS</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={epsData}>
              <CartesianGrid stroke="#23324a" />
              <XAxis dataKey="t" hide />
              <YAxis />
              <Tooltip contentStyle={{background:'#0b1220', border:'1px solid #23324a', color:'#e2e8f0'}}/>
              <Line type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card" style={{height:260}}>
          <div style={{marginBottom:8, fontWeight:600}}>Alerts by severity</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bySeverity}>
              <CartesianGrid stroke="#23324a" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={{background:'#0b1220', border:'1px solid #23324a', color:'#e2e8f0'}}/>
              <Bar dataKey="count" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}}>
        <div className="card">
          <div style={{marginBottom:8, fontWeight:600}}>Recent alerts</div>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead><tr><th style={{textAlign:'left', padding:8, borderBottom:'1px solid #334155'}}>title</th><th style={{textAlign:'left', padding:8, borderBottom:'1px solid #334155'}}>severity</th></tr></thead>
            <tbody>
              {(alerts||[]).slice(0,8).map((a:any)=> (
                <tr key={a.alert_id}><td style={{padding:8, borderTop:'1px solid #334155'}}>{a.alert_title||a.title||a.alert_id}</td><td style={{padding:8, borderTop:'1px solid #334155'}}>{a.severity}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div style={{marginBottom:8, fontWeight:600}}>Streaming health</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:8}}>
            <div className="card"><div>Lag (ms)</div><div style={{fontSize:20,fontWeight:700}}>{Math.round(lag)}</div></div>
            <div className="card"><div>Acks/s</div><div style={{fontSize:20,fontWeight:700}}>{ackPerSec.toFixed(2)}</div></div>
            <div className="card"><div>Eval errors</div><div style={{fontSize:20,fontWeight:700}}>{Math.round(evalErrors)}</div></div>
            <div className="card"><div>Backpressure</div><div style={{fontSize:20,fontWeight:700}}>{Math.round(backpressure)}</div></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function sumMetric(metricsText: string, name: string): number {
  if(!metricsText) return 0
  return metricsText.split('\n').reduce((acc, line)=>{
    if(line.startsWith(name)){
      const m = line.match(/\s([0-9.]+)$/)
      if(m) acc += parseFloat(m[1])
    }
    return acc
  }, 0)
}


