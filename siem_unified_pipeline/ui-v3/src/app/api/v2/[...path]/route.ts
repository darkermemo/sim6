export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_ORIGIN = process.env.API_URL || 'http://127.0.0.1:9999';

async function forward(req: Request, pathname: string) {
  const url = new URL(req.url);
  const dest = `${API_ORIGIN}/api/v2/${pathname}${url.search}`;
  const h = new Headers(req.headers);
  h.delete('host'); h.delete('origin'); h.delete('referer');

  return fetch(dest, {
    method: req.method,
    headers: h,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
    redirect: 'manual',
    cache: 'no-store',
    duplex: 'half',
  } as RequestInit);
}

// Next 15 requires awaiting params
export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) { 
  const resolvedParams = await ctx.params; 
  return forward(req, (resolvedParams.path ?? []).join('/')); 
}
export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) { 
  const resolvedParams = await ctx.params; 
  return forward(req, (resolvedParams.path ?? []).join('/')); 
}
export async function PUT(req: Request, ctx: { params: Promise<{ path?: string[] }> }) { 
  const resolvedParams = await ctx.params; 
  return forward(req, (resolvedParams.path ?? []).join('/')); 
}
export async function PATCH(req: Request, ctx: { params: Promise<{ path?: string[] }> }) { 
  const resolvedParams = await ctx.params; 
  return forward(req, (resolvedParams.path ?? []).join('/')); 
}
export async function DELETE(req: Request, ctx: { params: Promise<{ path?: string[] }> }) { 
  const resolvedParams = await ctx.params; 
  return forward(req, (resolvedParams.path ?? []).join('/')); 
}
