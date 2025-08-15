import type { Filter, Scalar, Range, SchemaMap } from '@/types/filters'

const lit = (v: Scalar): string =>
  typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'true' : 'false') : `'${String(v).replace(/'/g, "\\'")}'`

const fqn = (field: string, isJson: boolean) => (isJson ? `json.${field}` : field)

export function compileFiltersToQ(root: Filter, schema: SchemaMap): string {
  function emit(n: Filter): string {
    if (n.kind === 'group') {
      const parts = n.children.map(emit).filter(Boolean)
      return parts.length ? `(${parts.join(` ${n.logic} `)})` : ''
    }
    const meta = schema[n.field] || { type: 'String', source: 'column' as const }
    const F = fqn(n.field, meta.source === 'json')
    const neg = n.negate ? 'NOT ' : ''

    switch (n.op) {
      case 'exists':
        return `${neg}EXISTS(${F})`
      case 'not_exists':
        return `NOT EXISTS(${F})`
      case 'eq':
        return `${neg}${F} = ${lit(n.value as Scalar)}`
      case 'neq':
        return `${neg}${F} != ${lit(n.value as Scalar)}`
      case 'in': {
        const arr = (n.value as Scalar[]).map(lit).join(', ')
        return `${neg}${F} IN (${arr})`
      }
      case 'contains':
        return `${neg}contains(${F}, ${lit(n.value as Scalar)})`
      case 'prefix':
        return `${neg}startsWith(${F}, ${lit(n.value as Scalar)})`
      case 'regex':
        return `${neg}match(${F}, ${lit(n.value as Scalar)})`
      case 'cidr':
        return `${neg}cidrContains(${lit(n.value as Scalar)}, ${F})`
      case 'lt':
        return `${neg}${F} < ${lit(n.value as Scalar)}`
      case 'lte':
        return `${neg}${F} <= ${lit(n.value as Scalar)}`
      case 'gt':
        return `${neg}${F} > ${lit(n.value as Scalar)}`
      case 'gte':
        return `${neg}${F} >= ${lit(n.value as Scalar)}`
      case 'range': {
        const [a, b] = n.value as Range
        return `${neg}(${F} BETWEEN ${lit(a as Scalar)} AND ${lit(b as Scalar)})`
      }
      default:
        return ''
    }
  }
  return emit(root) || '*'
}


