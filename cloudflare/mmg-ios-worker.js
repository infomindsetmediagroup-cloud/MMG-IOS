import { handleKairosApiRequest } from "./kairos/runtime.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleKairosApiRequest(request, env, ctx);
    }

    if (url.pathname === "/web/kairos-dashboard" || url.pathname === "/web/kairos-dashboard/") {
      return Response.redirect(`${url.origin}/`, 302);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withAssetHeaders(assetResponse);
  },
};

function withAssetHeaders(response) {
  const headers = new Headers(response.headers);
  if ((headers.get("content-type") || "").includes("text/html")) {
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  } else {
    headers.set("Cache-Control", "public, max-age=300");
  }
  headers.set("X-MMG-Host", "cloudflare");
  headers.set("X-MMG-Kairos-Runtime", "cloudflare-native");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
