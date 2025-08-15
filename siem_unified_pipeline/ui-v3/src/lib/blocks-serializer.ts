import type { Block, FieldConditionBlock, SequenceBlock, RollingBlock, RatioBlock, SpikeBlock, FirstSeenBlock } from '@/types/blocks'

const quote = (v: any) => typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v? 'true':'false') : `"${String(v).replace(/"/g,'\\"')}"`

function serializeField(b: FieldConditionBlock): string {
  const val = Array.isArray(b.value) ? `[${(b.value as any[]).map(quote).join(',')}]` : quote(b.value as any)
  if (b.op === 'in' || b.op === 'not in') {
    const arr = Array.isArray(b.value) ? `[${(b.value as any[]).map(quote).join(',')}]` : `[${quote(b.value as any)}]`
    return `field(${b.field}) ${b.op} ${arr}`
  }
  return `field(${b.field}) ${b.op} ${val}`
}

export function serializeBlocks(blocks: Block[]): string {
  const atoms: string[] = []
  for (const b of blocks) {
    if (b.kind === 'field') atoms.push(serializeField(b))
    if (b.kind === 'sequence') atoms.push(serializeSequence(b))
    if (b.kind === 'rolling') atoms.push(serializeRolling(b))
    if (b.kind === 'ratio') atoms.push(serializeRatio(b))
    if (b.kind === 'spike') atoms.push(serializeSpike(b))
    if (b.kind === 'first_seen') atoms.push(serializeFirstSeen(b))
  }
  return atoms.join('\n') // AND by default (backend treats newline or space as AND)
}

function serializeSequence(b: SequenceBlock): string {
  const stages = b.stages.map(st => {
    const s = st.conditions.map(serializeField).join(' AND ')
    return st.repeat_min && st.repeat_min>1 ? `${s}[x${st.repeat_min}]` : s
  }).join('->')
  const strict = b.strict_once ? ',strict=strict_once' : ''
  const by = b.by?.length ? `,by=${b.by.join(',')}` : ''
  return `seq(${stages},${Math.round(b.window_sec/60)}m${by}${strict})`
}

function serializeRolling(b: RollingBlock): string {
  const src = b.source ? `,source=${b.source}` : ''
  const expr = `${b.func}(${b.metric}) ${b.op} ${b.value}`
  const by = b.by?.length ? `,by=${b.by.join(',')}` : ''
  return `roll(${expr},${Math.round(b.window_sec/60)}m${by}${src})`
}

function serializeRatio(b: RatioBlock): string {
  const by = b.by?.length ? `,by=${b.by.join(',')}` : ''
  return `ratio(${b.numerator}:${b.denominator} ${b.op} ${b.k},${Math.round(b.bucket_sec/60)}m${by})`
}

function serializeSpike(b: SpikeBlock): string {
  const by = b.by?.length ? `,by=${b.by.join(',')}` : ''
  return `spike(${b.metric},z>=${b.z},${Math.round(b.window_sec/60)}m vs ${b.history_buckets}b${by})`
}

function serializeFirstSeen(b: FirstSeenBlock): string {
  const by = b.by?.length ? `,by=${b.by.join(',')}` : ''
  return `first_seen(${b.dimension},${b.horizon_days}d${by})`
}


