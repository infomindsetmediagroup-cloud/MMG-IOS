const VERCEL_RUNTIME_ORIGIN = "https://mmg-ios.vercel.app";
const RAW_REPOSITORY_ORIGIN = "https://raw.githubusercontent.com/infomindsetmediagroup-cloud/MMG-IOS/main/web/kairos-dashboard";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return proxyRuntimeRequest(request, url);
    }

    return serveCommandCenterAsset(request, url);
  },
};

async function serveCommandCenterAsset(request, incomingURL) {
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

  const upstreamURL = `${RAW_REPOSITORY_ORIGIN}${pathname}${incomingURL.search}`;
  const upstream = await fetch(upstreamURL, {
    method: request.method,
    headers: { Accept: request.headers.get("Accept") || "*/*" },
    cf: { cacheEverything: true, cacheTtl: pathname.endsWith(".html") ? 0 : 300 },
  });

  if (!upstream.ok) {
    if (pathname !== "/index.html" && !hasFileExtension(pathname)) {
      return serveCommandCenterAsset(new Request(`${incomingURL.origin}/index.html`, request), new URL(`${incomingURL.origin}/index.html`));
    }
    return new Response("Command Center asset not found", { status: upstream.status });
  }

  const headers = new Headers(upstream.headers);
  headers.set("Content-Type", contentTypeFor(pathname));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-MMG-Host", "cloudflare");
  headers.set(
    "Cache-Control",
    pathname.endsWith(".html") ? "no-cache, no-store, must-revalidate" : "public, max-age=300",
  );
  headers.delete("content-security-policy");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function proxyRuntimeRequest(request, incomingURL) {
  const targetURL = new URL(`${incomingURL.pathname}${incomingURL.search}`, VERCEL_RUNTIME_ORIGIN);
  const headers = new Headers(request.headers);
  headers.set("X-MMG-Proxy-Origin", incomingURL.origin);
  headers.set("X-Forwarded-Host", incomingURL.host);
  headers.delete("host");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;

  const upstream = await fetch(targetURL, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-MMG-Runtime-Proxy", "cloudflare-to-vercel");
  responseHeaders.delete("access-control-allow-origin");
  responseHeaders.delete("access-control-allow-credentials");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
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
