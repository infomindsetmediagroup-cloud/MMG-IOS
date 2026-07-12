import runtime from "./entry-v2.js";

const ASSET_ORIGINS = [
  "https://cdn.jsdelivr.net/gh/infomindsetmediagroup-cloud/MMG-IOS@main/web/kairos-dashboard",
  "https://raw.githubusercontent.com/infomindsetmediagroup-cloud/MMG-IOS/main/web/kairos-dashboard",
];
const ASSET_TIMEOUT_MS = 20000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return runtime.fetch(request, env, ctx);
    return serveAsset(request, url);
  },
};

async function serveAsset(request, incomingURL) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  let pathname = incomingURL.pathname;
  if (pathname === '/' || pathname === '/web/kairos-dashboard' || pathname === '/web/kairos-dashboard/') pathname = '/index.html';
  else if (pathname.startsWith('/web/kairos-dashboard/')) pathname = pathname.slice('/web/kairos-dashboard'.length);
  if (pathname.includes('..')) return new Response('Invalid path', { status: 400 });

  const query = incomingURL.search || '';
  const attempts = ASSET_ORIGINS.map(origin => fetchAsset(`${origin}${pathname}${query}`, request));
  let result;
  try {
    result = await Promise.any(attempts);
  } catch {
    if (!hasExtension(pathname)) return serveAsset(request, new URL(`${incomingURL.origin}/index.html${query}`));
    return new Response('Kairos asset unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '3', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const headers = new Headers();
  headers.set('Content-Type', contentType(pathname));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', pathname.endsWith('.html') ? 'no-store, max-age=0' : 'public, max-age=300, stale-while-revalidate=86400');
  headers.set('X-MMG-Host', 'stable-shell-proxy');
  headers.set('Content-Length', String(result.byteLength));
  return new Response(request.method === 'HEAD' ? null : result, { status: 200, headers });
}

async function fetchAsset(target, request) {
  const response = await fetch(target, {
    method: request.method,
    headers: { Accept: request.headers.get('Accept') || '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
    cf: { cacheEverything: true, cacheTtl: 300 },
  });
  if (!response.ok) throw new Error(`Asset origin returned ${response.status}`);
  if (request.method === 'HEAD') return new ArrayBuffer(0);
  const body = await response.arrayBuffer();
  if (!body.byteLength) throw new Error('Asset origin returned an empty body');
  return body;
}

function hasExtension(pathname) {
  return /\/[A-Za-z0-9._-]+\.[A-Za-z0-9]+$/.test(pathname);
}

function contentType(pathname) {
  if (pathname.endsWith('.html')) return 'text/html; charset=utf-8';
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (pathname.endsWith('.json')) return 'application/json; charset=utf-8';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.png')) return 'image/png';
  if (/\.jpe?g$/i.test(pathname)) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}
