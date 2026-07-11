import runtime from "./worker.js";

const ASSET_ROOTS = [
  "https://raw.githubusercontent.com/infomindsetmediagroup-cloud/MMG-IOS/main/web/kairos-dashboard",
  "https://cdn.jsdelivr.net/gh/infomindsetmediagroup-cloud/MMG-IOS@main/web/kairos-dashboard",
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return runtime.fetch(request, env, ctx);
    }
    return serveResilientAsset(request, url);
  },
};

async function serveResilientAsset(request, incomingURL) {
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  let pathname = incomingURL.pathname;
  if (pathname === "/" || pathname === "/web/kairos-dashboard" || pathname === "/web/kairos-dashboard/") {
    pathname = "/index.html";
  } else if (pathname.startsWith("/web/kairos-dashboard/")) {
    pathname = pathname.slice("/web/kairos-dashboard".length);
  }

  if (pathname.includes("..")) return new Response("Invalid path", { status: 400 });

  const isHTML = pathname.endsWith(".html");
  const attempts = [];
  for (const root of ASSET_ROOTS) {
    const target = `${root}${pathname}${incomingURL.search}`;
    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers: { Accept: request.headers.get("Accept") || "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(4500),
        cf: { cacheEverything: true, cacheTtl: isHTML ? 30 : 900 },
      });
      attempts.push({ target, status: upstream.status });
      if (!upstream.ok) continue;
      const headers = new Headers(upstream.headers);
      headers.set("Content-Type", contentTypeFor(pathname));
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-MMG-Host", "cloudflare-resilient");
      headers.set("Cache-Control", isHTML ? "no-cache, no-store, must-revalidate" : "public, max-age=900, stale-while-revalidate=86400");
      headers.delete("content-security-policy");
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
    } catch (error) {
      attempts.push({ target, error: error instanceof Error ? error.message : "fetch failed" });
    }
  }

  if (pathname !== "/index.html" && !hasFileExtension(pathname)) {
    return serveResilientAsset(new Request(`${incomingURL.origin}/index.html`, request), new URL(`${incomingURL.origin}/index.html`));
  }

  if (pathname === "/index.html") return recoveryPage(attempts);
  return new Response("Command Center asset temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
}

function recoveryPage(attempts) {
  const safe = JSON.stringify(attempts).replace(/[<>&]/g, "");
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kairos Recovery</title><style>body{margin:0;background:#05080d;color:#eef2f7;font-family:system-ui;padding:32px}main{max-width:720px;margin:12vh auto;background:#101722;border:1px solid #21465a;border-radius:24px;padding:28px}h1{font-size:2rem}p{color:#b8c1cc;line-height:1.5}button{width:100%;padding:16px;border:0;border-radius:999px;background:#24b7f2;font-weight:800;font-size:1rem}small{display:block;margin-top:18px;color:#71808f;word-break:break-all}</style></head><body><main><p>KAIROS RECOVERY MODE</p><h1>The Command Center asset service is temporarily unavailable.</h1><p>The Cloudflare runtime is still active. This page will retry automatically instead of remaining blank.</p><button onclick="location.reload()">Retry now</button><small>${safe}</small></main><script>setTimeout(()=>location.reload(),5000)</script></body></html>`, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" } });
}

function hasFileExtension(pathname) {
  return /\/[A-Za-z0-9._-]+\.[A-Za-z0-9]+$/.test(pathname);
}

function contentTypeFor(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}
