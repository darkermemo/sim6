// app/api/v2/[...path]/route.ts
const ORIGIN = process.env.API_URL!.replace(/\/+$/, "");

async function forward(req: Request, pathSegs: string[]) {
  const url = new URL(req.url);
  const qs  = url.search ? url.search : "";
  const dest = `${ORIGIN}/api/v2/${pathSegs.join("/")}${qs}`;

  const headers = new Headers(req.headers);
  headers.delete("host"); headers.delete("origin"); headers.delete("referer");

  const init: RequestInit = {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    redirect: "manual",
  };

  const r = await fetch(dest, init);
  const out = new Response(r.body, { status: r.status, statusText: r.statusText });
  r.headers.forEach((v, k) => out.headers.set(k, v));
  return out;
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params; return forward(req, path);
}
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params; return forward(req, path);
}
export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params; return forward(req, path);
}
export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params; return forward(req, path);
}
export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params; return forward(req, path);
}
