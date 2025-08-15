'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { ActionButton } from '@/components/ui/ActionButton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

type RunResult = {
  ok: boolean
  code: number
  stdout: string
  stderr: string
  used_env: Record<string, string>
  scenarios: string[]
  all: boolean
}

const ALL_SCENARIOS = [
  'seq','absence','chain','rolling','ratio','first_seen','beacon','burst','tod','travel','lex','spread'
]

export default function AttackSimulationsPage() {
  const [tenantId, setTenantId] = useState('t_fixture')
  const [all, setAll] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const toggle = useCallback((key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }, [])

  const canRun = useMemo(() => running === false && (all || selected.length > 0), [running, all, selected])

  const run = useCallback(async () => {
    setRunning(true)
    setErr(null)
    setResult(null)
    try {
      const res = await fetch('/ui/v3/api/fixtures/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          all,
          scenarios: selected,
          env: { TENANT_ID: tenantId },
        }),
      })
      const json = (await res.json()) as RunResult
      if (!res.ok) {
        setErr(json.stderr || 'Fixture generation failed')
      }
      setResult(json)
    } catch (e: any) {
      setErr(String(e))
    } finally {
      setRunning(false)
    }
  }, [all, selected, tenantId])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Attack Simulations</h1>
        <p className="text-muted-foreground">Generate fixture logs in ClickHouse for detection smoke testing</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fixture Target</CardTitle>
          <CardDescription>Data is written into `siem_v3.events_norm` under the selected tenant</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>Tenant ID</Label>
            <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="all" checked={all} onCheckedChange={setAll} />
            <Label htmlFor="all">Generate all scenarios</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scenarios</CardTitle>
          <CardDescription>Select subsets when &quot;all&quot; is disabled</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ALL_SCENARIOS.map((s) => (
            <button
              key={s}
              className={`px-3 py-1 rounded border text-sm ${selected.includes(s) ? 'bg-primary text-primary-foreground' : ''}`}
              onClick={() => toggle(s)}
              disabled={all}
              aria-pressed={selected.includes(s)}
            >
              {s}
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <ActionButton 
          onClick={run} 
          disabled={!canRun}
          data-action="attack-simulations:fixtures:generate"
          data-intent="api"
          data-endpoint="/api/fixtures/run"
        >
          {running ? 'Running…' : 'Generate Logs'}
        </ActionButton>
        {result?.ok && (
          <Badge variant="secondary">OK • {result.scenarios.length || 'all'} scenario(s)</Badge>
        )}
      </div>

      {err && (
        <div className="text-sm text-red-600 border border-red-300 bg-red-50 p-3 rounded">{err}</div>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Run Output</CardTitle>
            <CardDescription>Exit code: {result.code}</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[300px] whitespace-pre-wrap">{result.stdout || '(no output)'}</pre>
            {result.stderr && (
              <pre className="text-xs bg-red-50 border border-red-200 text-red-700 p-3 rounded overflow-auto max-h-[200px] whitespace-pre-wrap mt-3">{result.stderr}</pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}


