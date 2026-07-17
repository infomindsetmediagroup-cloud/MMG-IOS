import runtime, { KairosProject } from "./kairos-production-entry-v45.js";

const BUILD = "kairos-production-entry-20260717-104";
const ROOT_SHELL_PATHS = new Set(["/", "/index.html"]);

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((request.method === "GET" || request.method === "HEAD") && ROOT_SHELL_PATHS.has(url.pathname)) {
      const shell = await serveRootShell(request, env);
      if (shell) return stamp(shell);
    }

    return stamp(await runtime.fetch(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

async function serveRootShell(request, env) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") return null;

  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/index.html";
  assetUrl.search = "";

  const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    redirect: request.redirect,
  }));

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Kairos-Command-Center-Route", "direct-assets-root-shell");
  headers.set("X-Kairos-App-Entry", BUILD);

  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-App-Entry", BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
