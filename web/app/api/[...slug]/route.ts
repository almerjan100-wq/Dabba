import { NextRequest } from 'next/server';
import { dispatch } from '@/lib/server/router';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

type RouteCtx = { params: Promise<{ slug: string[] }> };

async function handle(req: NextRequest, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  return dispatch(req, slug || []);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;

export function OPTIONS() {
  // CORS headers are added by middleware.ts
  return new Response(null, { status: 204 });
}
