type Json = Record<string, unknown> | unknown[];
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';

const RAW_BASE = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
if (!RAW_BASE) {
  console.warn("VITE_API_URL is empty; defaulting to http://127.0.0.1:9999");
}
const API_ROOT = `${RAW_BASE || "http://127.0.0.1:9999"}/api/v2`;

export class ApiError extends Error {
  status: number;
  url: string;
  requestId?: string;
  body?: unknown;
  constructor(message: string, status: number, url: string, requestId?: string, body?: unknown) {
    super(message);
    this.status = status;
    this.url = url;
    this.requestId = requestId;
    this.body = body;
  }
}

async function http<T>(
  path: string,
  init: RequestInit & { signal?: AbortSignal } = {}
): Promise<T> {
  const url = path.startsWith("/") ? `${API_ROOT}${path}` : `${API_ROOT}/${path}`;
  const headers = new Headers(init.headers || {});
  
  // Enterprise HTTP optimizations
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  headers.set("accept", "application/json");
  headers.set("accept-encoding", "gzip, deflate, br");
  headers.set("connection", "keep-alive");
  
  // Performance optimizations
  const enhancedInit: RequestInit = {
    ...init,
    headers,
    keepalive: true, // Keep connections alive for better performance
    cache: init.method === 'GET' ? 'default' : 'no-cache', // Cache GET requests
  };

  const resp = await fetch(url, enhancedInit);
  const requestId = resp.headers.get("x-request-id") ?? undefined;

  const text = await resp.text();
  const body = text ? safeJson(text) : undefined;

  if (!resp.ok) {
    const msg = (body as any)?.error || `${resp.status} ${resp.statusText}`;
    throw new ApiError(msg, resp.status, url, requestId, body);
  }
  return (body as T);
}

const safeJson = (s: string) => {
  try { return JSON.parse(s); } catch { return s; }
};

export function get<T>(path: string, init?: RequestInit) {
  const { signal, ...rest } = init || {};
  return http<T>(path, { ...(rest as RequestInit), signal: signal ?? undefined, method: "GET" });
}

export function post<T>(path: string, body?: Json, init?: RequestInit) {
  const { signal, ...rest } = init || {};
  return http<T>(path, { ...(rest as RequestInit), signal: signal ?? undefined, method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export function del<T>(path: string, init?: RequestInit) {
  const { signal, ...rest } = init || {};
  return http<T>(path, { ...(rest as RequestInit), signal: signal ?? undefined, method: "DELETE" });
}

export function patch<T>(path: string, body?: Json, init?: RequestInit) {
  const { signal, ...rest } = init || {};
  return http<T>(path, { ...(rest as RequestInit), signal: signal ?? undefined, method: "PATCH", body: body ? JSON.stringify(body) : undefined });
}

// Aliases with explicit names to avoid any tooling collisions
export const httpGet = get;
export const httpPost = post;
export const httpDel = del;
export const httpPatch = patch;

export async function getOptional<T>(path: string, init?: RequestInit): Promise<T | undefined> {
  try {
    return await get<T>(path, init);
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err && (err as any).status === 404) {
      return undefined;
    }
    throw err;
  }
}

export class ValidationError extends Error {
  name = 'ValidationError';
  status = 422;
  issues: ZodError['issues'];
  constructor(message: string, issues: ZodError['issues']) {
    super(message);
    this.issues = issues;
  }
}

const HARD_FAIL = (import.meta as any)?.env?.VITE_HARD_FAIL_ON_SCHEMA === '1';

export async function zget<T>(path: string, schema: ZodSchema<T>, init?: RequestInit): Promise<T> {
  const json = await get<unknown>(path, init);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // Always log the mismatch
    console.error('Zod schema mismatch (GET)', { path, issues: parsed.error.issues });
    if (HARD_FAIL) {
      throw new ValidationError(`Schema mismatch for GET ${path}`, parsed.error.issues);
    }
    // Return original json to avoid crashing in non-hard-fail mode
    return json as T;
  }
  return parsed.data;
}

export async function zpost<TReq extends Json | undefined, TRes>(
  path: string,
  body: TReq,
  schema: ZodSchema<TRes>,
  init?: RequestInit
): Promise<TRes> {
  const json = await post<unknown>(path, body as any, init);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error('Zod schema mismatch (POST)', { path, issues: parsed.error.issues });
    if (HARD_FAIL) {
      throw new ValidationError(`Schema mismatch for POST ${path}`, parsed.error.issues);
    }
    return json as TRes;
  }
  return parsed.data;
}

// Enhanced HTTP helpers with optional endpoint support
type HttpOpts<T> = { 
  signal?: AbortSignal; 
  optional?: boolean; 
  defaultValue?: T 
};

async function toApiError(res: Response) {
  let body: any = undefined;
  try { body = await res.json(); } catch { /* noop */ }
  return new ApiError(`HTTP ${res.status} for ${res.url}`, res.status, res.url, undefined, body);
}

// Simplified HTTP functions - use the existing get/post functions above instead

export { API_ROOT };


