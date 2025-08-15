import { useEffect, useMemo, useState } from 'react'
import type { FieldMeta, SchemaMap } from '@/types/filters'

export function useSchema(tenant_id: string) {
  const [fields, setFields] = useState<FieldMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/ui/v3/api/v2/schema/fields?tenant_id=${encodeURIComponent(tenant_id)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const arr = d.fields || d || []
        setFields(arr)
      })
      .catch(e => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [tenant_id])

  const map: SchemaMap = useMemo(() => {
    const m: SchemaMap = {}
    for (const f of fields) m[f.name] = { type: f.type, source: (f as any).source || 'column' }
    return m
  }, [fields])

  return { fields, map, loading, error }
}


