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

// Safe badge/color mapping - SOLID ONLY
export const severityColors: Record<Severity, string> = {
  critical: 'bg-red-600 text-red-100 border-red-600',
  high: 'bg-orange-600 text-orange-100 border-orange-600',
  medium: 'bg-amber-600 text-amber-100 border-amber-600',
  low: 'bg-yellow-600 text-yellow-100 border-yellow-600',
  info: 'bg-sky-600 text-sky-100 border-sky-600',
  unknown: 'bg-zinc-600 text-zinc-100 border-zinc-600',
};
