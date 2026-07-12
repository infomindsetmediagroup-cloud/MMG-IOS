import reconciledWorker from "./reconciled-worker.js";

const RESET_BUILD = "kairos-runtime-reset-20260711-4";
const STOREFRONT_TIMEOUT_MS = 15_000;

const CAPABILITIES = {
  commandCenterShell: "available",
  operatorSession: "available",
  kairosAdvisory: "available",
  storefrontInspection: "operational-read-only",
  shopifyThemePlanning: "validation-required",
  shopifyThemeMutation: "locked-pending-staging-adapter",
  productPublishing: "not-implemented",
  collectionPublishing: "not-implemented",
  navigationPublishing: "not-implemented",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        status: "reset",
        runtime: "cloudflare-workers",
        build: RESET_BUILD,
        operationalMode: "controlled-rebuild",
        capabilities: CAPABILITIES,
        message: "Kairos is rebuilding one verified capability at a time. Shopify planning preview is enabled; mutation remains locked until the staging-theme adapter passes acceptance testing.",
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/capabilities") {
      return json({ build: RESET_BUILD, operationalMode: "controlled-rebuild", capabilities: CAPABILITIES, checkedAt: new Date().toISOString() });
    }

    if (url.pathname === "/api/storefront/inspect") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return inspectStorefront(env);
    }

    if (url.pathname === "/api/shopify/theme/plan") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      const delegatedURL = new URL(request.url);
      delegatedURL.pathname = "/api/theme-plan";
      return reconciledWorker.fetch(new Request(delegatedURL.toString(), request), env, ctx);
    }

    if (url.pathname === "/api/theme-plan") {
      return json({
        error: {
          code: "use_governed_theme_plan_route",
          message: "Use the governed Shopify planning route inside the Kairos Command Center.",
        },
      }, 409);
    }

    if ((url.pathname === "/api/actions" || url.pathname === "/api/shopify/theme/execute") && request.method === "POST") {
      return json({
        error: {
          code: "staging_adapter_required",
          message: "Execution is locked until Kairos verifies an explicit non-live staging theme, source hashes, read-back verification, and rollback data.",
        },
      }, 503);
    }

    return reconciledWorker.fetch(request, env, ctx);
  },
};

async function inspectStorefront(env) {
  const origin = String(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/$/, "");
  const startedAt = new Date().toISOString();
  const pages = [];
  const errors = [];

  for (const path of ["/", "/sitemap.xml"]) {
    try {
      const response = await fetch(`${origin}${path}`, {
        headers: { Accept: path.endsWith(".xml") ? "application/xml,text/xml" : "text/html" },
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
      errors.push({ path, message: error instanceof Error ? error.message : "Inspection failed." });
    }
  }

  const homepage = pages.find(page => page.path === "/");
  const sitemap = pages.find(page => page.path === "/sitemap.xml");
  const operational = Boolean(homepage?.ok && sitemap?.ok);

  return json({
    actionID: crypto.randomUUID(),
    actionType: "storefront.inspect",
    status: operational ? "completed" : "needs-attention",
    readOnly: true,
    startedAt,
    completedAt: new Date().toISOString(),
    storefront: origin,
    summary: operational
      ? "The public storefront and sitemap responded successfully."
      : "The public storefront inspection completed with one or more failures.",
    evidence: { homepage, sitemap, pages, errors },
  }, operational ? 200 : 502);
}

function extractTag(html, tag) {
  const match = String(html || "").match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) : "";
}

function methodNotAllowed(allow) {
  const response = json({ error: { code: "method_not_allowed", message: "Method not allowed." } }, 405);
  response.headers.set("Allow", allow);
  return response;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": RESET_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
