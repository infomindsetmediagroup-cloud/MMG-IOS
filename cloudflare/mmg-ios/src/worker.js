const VERCEL_RUNTIME_ORIGIN = "https://mmg-ios.vercel.app";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return proxyRuntimeRequest(request, url);
    }

    if (url.pathname === "/web/kairos-dashboard" || url.pathname === "/web/kairos-dashboard/") {
      return Response.redirect(`${url.origin}/`, 302);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Host", "cloudflare");
    headers.set(
      "Cache-Control",
      (headers.get("content-type") || "").includes("text/html")
        ? "no-cache, no-store, must-revalidate"
        : "public, max-age=300",
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

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
