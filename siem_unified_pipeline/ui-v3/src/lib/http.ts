// lib/http.ts
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `/api/v2/${path.replace(/^\/+/, "")}`;
  const r = await fetch(url, { ...init, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}