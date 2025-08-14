// src/lib/severity.ts
export type Severity = 'critical'|'high'|'medium'|'low'|'info'|'unknown';

export function normalizeSeverity(input: unknown): Severity {
  const s = (input ?? '').toString().trim().toLowerCase();
  if (['critical','crit','fatal','severe','p1'].includes(s)) return 'critical';
  if (['high','error','err','p2'].includes(s)) return 'high';
  if (['medium','warn','warning','p3'].includes(s)) return 'medium';
  if (['low','notice','p4'].includes(s)) return 'low';
  if (['info','information','informational','debug','trace'].includes(s)) return 'info';
  return 'unknown';
}

// Safe badge/color mapping
export const severityColors: Record<Severity, string> = {
  critical: 'bg-red-600/15 text-red-400 border-red-600/30',
  high: 'bg-orange-600/15 text-orange-400 border-orange-600/30',
  medium: 'bg-amber-600/15 text-amber-400 border-amber-600/30',
  low: 'bg-yellow-600/15 text-yellow-400 border-yellow-600/30',
  info: 'bg-sky-600/15 text-sky-400 border-sky-600/30',
  unknown: 'bg-zinc-600/15 text-zinc-400 border-zinc-600/30',
};
