// lib/http.ts
const BASE = process.env.NEXT_PUBLIC_BASEPATH || '';
const api = (p: string) => `${BASE}/api/v2${p.startsWith('/') ? p : `/${p}`}`;

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(api(path), { cache: 'no-store', ...init });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}