import { NextRequest, NextResponse } from 'next/server';

// The Dabba mobile app (and its web preview on another origin) calls these
// APIs with a bearer token, never cookies, so allowing any origin is safe.
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range, X-Requested-With',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

const SECURITY: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export function middleware(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS });
  }
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  for (const [k, v] of Object.entries(SECURITY)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: ['/api/:path*'] };
