const ROOT = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:9999").replace(/\/+$/, "");
const API = `${ROOT}/api/v2`;

export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    signal,
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return (await response.json()) as T;
}

export async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return (await response.json()) as T;
}


