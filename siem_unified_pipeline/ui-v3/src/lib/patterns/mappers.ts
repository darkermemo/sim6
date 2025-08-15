import type { RuleSpec, RatioRule, RollingRule, FirstSeenRule, BeaconRule } from '@/types/detections'

export type TermOp = '='|'!='|'in'|'not in'|'exists'
export type FilterNode =
  | { kind:'term'; field:string; op:TermOp; value:any }
  | { kind:'range'; field:string; gte?:number; lte?:number }
  | { kind:'and'|'or'|'not'; children: FilterNode[] }

export type SearchState = {
  tenant_id: string;
  time: { last_seconds?: number; from?: string; to?: string };
  groupBy?: string[];
  hint?: { kind?: 'ratio'|'rolling'|'first_seen'|'beacon'; params?: Record<string,any> };
}

export function filtersToSpec(state: SearchState, root: FilterNode): RuleSpec | null {
  const by = state.groupBy && state.groupBy.length ? state.groupBy : undefined

  if (state.hint?.kind === 'ratio') {
    const { bucket_sec=600, ratio_gt=20 } = state.hint.params || {}
    const hasAuth = contains(root, f => isEq(f,'event_type','auth'))
    const wantFailSucc = hasAny(root, [ f => isEq(f,'outcome',0), f => isIn(f,'outcome',[0,1]) ])
    if (hasAuth && wantFailSucc && by?.length) {
      const r: RatioRule = {
        type:'ratio', tenant_id: state.tenant_id, time: state.time, by,
        bucket_sec, ratio_gt,
        numerator:{ sql:"event_type='auth' AND outcome=0" },
        denominator:{ sql:"event_type='auth' AND outcome=1" },
        emit:{ limit:200 }
      }
      return r
    }
  }

  if (state.hint?.kind === 'rolling') {
    const { window_sec=300, expr='rolling > 100' } = state.hint.params || {}
    if (by?.length) {
      const r: RollingRule = { type:'rolling_threshold', tenant_id: state.tenant_id, time: state.time, by, window_sec, expr, emit:{ limit:200 } }
      return r
    }
  }

  if (state.hint?.kind === 'first_seen') {
    const { entity, horizon_days=180, within_sql } = state.hint.params || {}
    const ent = entity || by?.[by.length-1]
    if (ent) {
      const r: FirstSeenRule = {
        type:'first_seen', tenant_id: state.tenant_id, time: state.time,
        by: by?.filter(k => k !== ent), entity: ent, horizon_days,
        within: within_sql ? { sql: within_sql } : undefined, emit:{ limit:200 }
      }
      return r
    }
  }

  if (state.hint?.kind === 'beacon') {
    const { partition=['src_ip','dest_ip'], min_events=20, rsd_lt=0.2, where_sql } = state.hint.params || {}
    const r: BeaconRule = { type:'beaconing', tenant_id: state.tenant_id, time: state.time, partition, where: where_sql ? { sql: where_sql } : undefined, min_events, rsd_lt, emit:{ limit:200 } }
    return r
  }

  return null
}

export function specToFilters(spec: RuleSpec): { state: SearchState; root: FilterNode } {
  const base: SearchState = { tenant_id: spec.tenant_id, time: spec.time, groupBy: spec.by }
  switch (spec.type) {
    case 'ratio': return { state: { ...base, hint:{ kind:'ratio', params:{ bucket_sec: spec.bucket_sec, ratio_gt: spec.ratio_gt } } }, root: and([ term('event_type','=', 'auth'), or([ term('outcome','=',0), term('outcome','=',1) ]) ]) }
    case 'rolling_threshold': return { state: { ...base, hint:{ kind:'rolling', params:{ window_sec: spec.window_sec, expr: spec.expr } } }, root: and([]) }
    case 'first_seen': return { state: { ...base, hint:{ kind:'first_seen', params:{ entity: spec.entity, horizon_days: spec.horizon_days, within_sql: spec.within?.sql } } }, root: and([]) }
    case 'beaconing': return { state: { ...base, hint:{ kind:'beacon', params:{ partition: spec.partition, min_events: spec.min_events, rsd_lt: spec.rsd_lt, where_sql: spec.where?.sql } } }, root: and([]) }
    default: return { state: base, root: and([]) }
  }
}

const term = (field:string, op:TermOp, value:any): FilterNode => ({ kind:'term', field, op, value })
const and = (children:FilterNode[]): FilterNode => ({ kind:'and', children })
const or  = (children:FilterNode[]): FilterNode => ({ kind:'or', children })

function isEq(n:FilterNode, field:string, v:any){ return n.kind==='term' && n.field===field && n.op==='=' && n.value===v }
function isIn(n:FilterNode, field:string, arr:any[]){ return n.kind==='term' && n.field===field && n.op==='in' && Array.isArray(n.value) && n.value.every(x=>arr.includes(x)) }
function walk(n:FilterNode, f:(n:FilterNode)=>boolean): boolean { if (f(n)) return true; if ('children' in n && n.children) return n.children.some(c=>walk(c,f)); return false }
function contains(n:FilterNode, pred:(n:FilterNode)=>boolean){ return walk(n,pred) }
function hasAny(n:FilterNode, preds:Array<(n:FilterNode)=>boolean>){ return preds.some(p => contains(n,p)) }


