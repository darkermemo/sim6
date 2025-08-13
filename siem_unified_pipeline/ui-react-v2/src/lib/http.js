const RAW_BASE = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
if (!RAW_BASE) {
    console.warn("VITE_API_URL is empty; defaulting to http://127.0.0.1:9999");
}
const API_ROOT = `${RAW_BASE || "http://127.0.0.1:9999"}/api/v2`;
export class ApiError extends Error {
    constructor(message, status, url, requestId, body) {
        super(message);
        this.status = status;
        this.url = url;
        this.requestId = requestId;
        this.body = body;
    }
}
async function http(path, init = {}) {
    const url = path.startsWith("/") ? `${API_ROOT}${path}` : `${API_ROOT}/${path}`;
    const headers = new Headers(init.headers || {});
    if (!headers.has("content-type") && init.body)
        headers.set("content-type", "application/json");
    headers.set("accept", "application/json");
    const resp = await fetch(url, { ...init, headers });
    const requestId = resp.headers.get("x-request-id") ?? undefined;
    const text = await resp.text();
    const body = text ? safeJson(text) : undefined;
    if (!resp.ok) {
        const msg = body?.error || `${resp.status} ${resp.statusText}`;
        throw new ApiError(msg, resp.status, url, requestId, body);
    }
    return body;
}
const safeJson = (s) => {
    try {
        return JSON.parse(s);
    }
    catch {
        return s;
    }
};
export function get(path, init) {
    const { signal, ...rest } = init || {};
    return http(path, { ...rest, signal: signal ?? undefined, method: "GET" });
}
export function post(path, body, init) {
    const { signal, ...rest } = init || {};
    return http(path, { ...rest, signal: signal ?? undefined, method: "POST", body: body ? JSON.stringify(body) : undefined });
}
export function del(path, init) {
    const { signal, ...rest } = init || {};
    return http(path, { ...rest, signal: signal ?? undefined, method: "DELETE" });
}
export function patch(path, body, init) {
    const { signal, ...rest } = init || {};
    return http(path, { ...rest, signal: signal ?? undefined, method: "PATCH", body: body ? JSON.stringify(body) : undefined });
}
// Aliases with explicit names to avoid any tooling collisions
export const httpGet = get;
export const httpPost = post;
export const httpDel = del;
export const httpPatch = patch;
export async function getOptional(path, init) {
    try {
        return await get(path, init);
    }
    catch (err) {
        if (err && typeof err === "object" && "status" in err && err.status === 404) {
            return undefined;
        }
        throw err;
    }
}
export class ValidationError extends Error {
    constructor(message, issues) {
        super(message);
        this.name = 'ValidationError';
        this.status = 422;
        this.issues = issues;
    }
}
const HARD_FAIL = import.meta?.env?.VITE_HARD_FAIL_ON_SCHEMA === '1';
export async function zget(path, schema, init) {
    const json = await get(path, init);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
        // Always log the mismatch
        console.error('Zod schema mismatch (GET)', { path, issues: parsed.error.issues });
        if (HARD_FAIL) {
            throw new ValidationError(`Schema mismatch for GET ${path}`, parsed.error.issues);
        }
        // Return original json to avoid crashing in non-hard-fail mode
        return json;
    }
    return parsed.data;
}
export async function zpost(path, body, schema, init) {
    const json = await post(path, body, init);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
        console.error('Zod schema mismatch (POST)', { path, issues: parsed.error.issues });
        if (HARD_FAIL) {
            throw new ValidationError(`Schema mismatch for POST ${path}`, parsed.error.issues);
        }
        return json;
    }
    return parsed.data;
}
async function toApiError(res) {
    let body = undefined;
    try {
        body = await res.json();
    }
    catch { /* noop */ }
    return new ApiError(`HTTP ${res.status} for ${res.url}`, res.status, res.url, undefined, body);
}
// Simplified HTTP functions - use the existing get/post functions above instead
export { API_ROOT };
