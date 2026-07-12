const BUILD = "kairos-kernel-20260712-1";
const STOREFRONT_TIMEOUT_MS = 15_000;

const CAPABILITIES = Object.freeze({
  commandCenterShell: "available",
  runtimeHealth: "operational",
  capabilityRegistry: "operational",
  storefrontInspection: "validation-required",
  shopifyConnectionValidation: "next-build",
  shopifyThemePlanning: "locked-pending-connection-validation",
  shopifyThemeMutation: "locked-pending-staging-adapter",
  productPublishing: "not-implemented",
  collectionPublishing: "not-implemented",
  navigationPublishing: "not-implemented",
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        status: "ok",
        runtime: "cloudflare-workers",
        kernel: "standalone",
        build: BUILD,
        operationalMode: "controlled-rebuild",
        capabilities: CAPABILITIES,
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/capabilities") {
      return json({
        build: BUILD,
        kernel: "standalone",
        operationalMode: "controlled-rebuild",
        capabilities: CAPABILITIES,
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/storefront/inspect") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return inspectStorefront(env);
    }

    if (url.pathname === "/api/shopify/theme/plan") {
      return json({
        error: {
          code: "shopify_connection_validation_required",
          message: "Theme planning remains locked until the standalone Shopify connection validator proves authentication, scopes, main-theme access, and staging-theme discovery.",
        },
        build: BUILD,
      }, 503);
    }

    if (
      url.pathname === "/api/theme-plan" ||
      url.pathname === "/api/actions" ||
      url.pathname === "/api/shopify/theme/execute"
    ) {
      return json({
        error: {
          code: "external_mutation_locked",
          message: "External Shopify mutation is locked in the standalone Kairos kernel.",
        },
        build: BUILD,
      }, 503);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({
        error: {
          code: "api_route_not_found",
          message: "The requested Kairos API route is not available in this kernel build.",
        },
        build: BUILD,
      }, 404);
    }

    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return json({
        error: {
          code: "asset_binding_unavailable",
          message: "The Kairos shell asset binding is unavailable.",
        },
        build: BUILD,
      }, 503);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  },
};

async function inspectStorefront(env) {
  const origin = normalizeOrigin(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com");
  const startedAt = new Date().toISOString();
  const pages = [];
  const errors = [];

  for (const path of ["/", "/sitemap.xml"]) {
    try {
      const response = await fetch(`${origin}${path}`, {
        headers: {
          Accept: path.endsWith(".xml") ? "application/xml,text/xml;q=0.9,*/*;q=0.8" : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "User-Agent": "MMG-Kairos-Storefront-Inspector/1.0",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(STOREFRONT_TIMEOUT_MS),
      });

      const text = await response.text();
      pages.push({
        path,
        requestedUrl: `${origin}${path}`,
        finalUrl: response.url,
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get("content-type") || "",
        title: path === "/" ? extractTag(text, "title") : "",
        h1: path === "/" ? extractTag(text, "h1") : "",
        bytes: new TextEncoder().encode(text).length,
      });
    } catch (error) {
      errors.push({
        path,
        requestedUrl: `${origin}${path}`,
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : "Inspection failed.",
      });
    }
  }

  const homepage = pages.find(page => page.path === "/") || null;
  const sitemap = pages.find(page => page.path === "/sitemap.xml") || null;
  const operational = Boolean(homepage?.ok && sitemap?.ok && errors.length === 0);

  return json({
    actionID: crypto.randomUUID(),
    actionType: "storefront.inspect",
    build: BUILD,
    kernel: "standalone",
    status: operational ? "completed" : "needs-attention",
    readOnly: true,
    startedAt,
    completedAt: new Date().toISOString(),
    storefront: origin,
    summary: operational
      ? "The public storefront and sitemap responded successfully."
      : "The storefront inspection completed with one or more failed checks.",
    evidence: { homepage, sitemap, pages, errors },
  }, operational ? 200 : 502);
}

function normalizeOrigin(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:") throw new Error("MMG_STOREFRONT_ORIGIN must use HTTPS.");
  return url.origin;
}

function extractTag(html, tag) {
  const match = String(html || "").match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) : "";
}

function methodNotAllowed(allow) {
  const response = json({ error: { code: "method_not_allowed", message: "Method not allowed." }, build: BUILD }, 405);
  response.headers.set("Allow", allow);
  return response;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
