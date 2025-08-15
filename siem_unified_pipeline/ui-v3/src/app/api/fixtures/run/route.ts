export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

type Body = {
  scenarios?: string[]
  all?: boolean
  env?: Partial<{
    CH_URL: string
    CH_DB: string
    CH_TABLE: string
    CH_USER: string
    CH_PASS: string
    TENANT_ID: string
  }>
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body
  const env = {
    CH_URL: process.env.CH_URL || 'http://127.0.0.1:8123',
    CH_DB: process.env.CH_DB || 'siem_v3',
    CH_TABLE: process.env.CH_TABLE || 'events_norm',
    CH_USER: process.env.CH_USER || 'default',
    CH_PASS: process.env.CH_PASS || '',
    TENANT_ID: process.env.TENANT_ID || 't_fixture',
    ...(body.env || {}),
  }

  const scriptPath = path.join(process.cwd(), '../../tools/fixtures/generate_ch_fixtures.py')
  const args: string[] = [scriptPath]
  if (body.all) args.push('--all')
  const unique = Array.from(new Set(body.scenarios || []))
  if (!body.all && unique.length) args.push('--scenarios', unique.join(','))

  const child = spawn('python3', args, {
    env: { ...process.env, ...env },
    cwd: path.join(process.cwd(), '../..'),
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => (stdout += d.toString()))
  child.stderr.on('data', (d) => (stderr += d.toString()))

  const code: number = await new Promise((resolve) => child.on('close', resolve as any))

  return new Response(
    JSON.stringify({ ok: code === 0, code, stdout, stderr, used_env: env, scenarios: unique, all: !!body.all }),
    { status: code === 0 ? 200 : 500, headers: { 'content-type': 'application/json' } },
  )
}


