import { useEffect, useState } from 'react'

export function useValueHints(tenant_id: string, field: string | null, prefix: string, debounceMs = 250) {
  const [values, setValues] = useState<Array<{ v: string | number; c: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!field) { setValues([]); return }
    let cancelled = false
    const t = setTimeout(() => {
      setLoading(true)
      setError(null)
      const qs = new URLSearchParams({ tenant_id, field, prefix, limit: '50' }).toString()
      fetch(`/ui/v3/api/v2/schema/values?${qs}`)
        .then(r => r.json())
        .then(d => { if (!cancelled) setValues(d.values || d || []) })
        .catch(e => !cancelled && setError(String(e)))
        .finally(() => !cancelled && setLoading(false))
    }, debounceMs)
    return () => { cancelled = true; clearTimeout(t) }
  }, [tenant_id, field, prefix, debounceMs])

  return { values, loading, error }
}


