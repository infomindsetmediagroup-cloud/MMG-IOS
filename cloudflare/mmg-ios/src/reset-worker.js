import reconciledWorker from "./reconciled-worker.js";

const RESET_BUILD = "kairos-runtime-reset-20260711-2";
const STOREFRONT_TIMEOUT_MS = 15_000;

const CAPABILITIES = {
  commandCenterShell: "available",
  operatorSession: "available",
  kairosAdvisory: "available",
  storefrontInspection: "operational-read-only",
  shopifyThemePlanning: "not-operational",
  shopifyThemeMutation: "not-operational",
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
        operationalMode: "recovery",
        capabilities: CAPABILITIES,
        message: "Kairos is rebuilding from a truthful capability baseline. External Shopify mutation remains disabled until staging-theme acceptance testing is complete.",
        checkedAt: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/capabilities") {
      return json({ build: RESET_BUILD, operationalMode: "recovery", capabilities: CAPABILITIES, checkedAt: new Date().toISOString() });
    }

    if (url.pathname === "/api/storefront/inspect") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return inspectStorefront(env);
    }

    if (url.pathname === "/api/theme-plan") {
      return json({
        error: {
          code: "capability_not_operational",
          message: "Shopify theme planning is disabled during the formal Kairos runtime rebuild. The staging-theme workflow must pass acceptance testing before this capability is re-enabled.",
        },
      }, 503);
    }

    if (url.pathname === "/api/actions" && request.method === "POST") {
      return json({
        error: {
          code: "external_mutation_disabled",
          message: "External Shopify mutation is disabled during the formal Kairos runtime rebuild.",
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
