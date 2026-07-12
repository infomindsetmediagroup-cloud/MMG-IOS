import { createHash, randomUUID } from "node:crypto";
import primaryWorker from "./reconciled-worker.js";

const CSS_KEYS = ["assets/base.css", "assets/theme.css", "assets/styles.css", "assets/application.css"];
const MARKER = "/* MMG KAIROS GUIDED HOMEPAGE BASELINE */";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/theme-plan" || request.method !== "POST") return primaryWorker.fetch(request, env, ctx);

    try {
      return await verifiedThemePlan(request, env);
    } catch (error) {
      return json({ error: { code: error.code || "theme_plan_failed", message: error.message || "Verified theme planning failed.", requestID: randomUUID() } }, error.status || 500);
    }
  },
};

async function verifiedThemePlan(request, env) {
  const objective = String((await request.json())?.objective || "").trim();
  if (!objective) throw problem(400, "invalid_request", "The objective is required.");

  const shop = await shopify(env);
  const themes = await gql(shop, `query { themes(first:1, roles:[MAIN]) { nodes { id name role processing processingFailed } } }`);
  const theme = themes?.themes?.nodes?.[0];
  if (!theme || theme.role !== "MAIN") throw problem(502, "main_theme_unavailable", "Shopify did not return the published main theme.");
  if (theme.processing || theme.processingFailed) throw problem(409, "main_theme_processing", "The published Shopify theme is still processing or failed processing.");

  const match = String(theme.id || "").match(/^gid:\/\/shopify\/OnlineStoreTheme\/(\d+)$/);
  if (!match) throw problem(502, "invalid_theme_id", "Shopify returned an invalid theme ID.");
  const themeId = match[1];

  const data = await gql(shop, `query($id:ID!,$names:[String!]) { theme(id:$id) { files(first:5, filenames:$names) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } ... on OnlineStoreThemeFileBodyUrl { url } } } userErrors { code filename } } } }`, { id: theme.id, names: ["layout/theme.liquid", ...CSS_KEYS] });
  const connection = data?.theme?.files;
  const errors = (connection?.userErrors || []).filter(error => error?.code && error.code !== "NOT_FOUND");
  if (errors.length) throw problem(502, "theme_file_read_failed", "Shopify could not read the required theme files.");

  const files = [];
  for (const node of connection?.nodes || []) {
    const value = await bodyText(node?.body);
    if (typeof node?.filename === "string" && typeof value === "string") files.push({ key: node.filename, value });
  }

  const layout = files.find(file => file.key === "layout/theme.liquid");
  if (!layout) throw problem(409, "homepage_scope_source_missing", "Shopify did not return layout/theme.liquid.");
  if (!/template-index|template-\s*{{\s*(?:request\.page_type|template\.name)/i.test(layout.value)) throw problem(409, "homepage_scope_unverified", "The published layout does not prove homepage-only scope.");

  const stylesheet = CSS_KEYS.map(key => files.find(file => file.key === key)).find(Boolean);
  if (!stylesheet) throw problem(409, "homepage_stylesheet_unavailable", "No editable published stylesheet was returned.");
  if (stylesheet.value.includes(MARKER)) throw problem(409, "guided_baseline_already_applied", "The guided-homepage baseline is already present.");

  const css = `${MARKER}\n.template-index main{--mmg-guided-section-gap:clamp(1.5rem,4vw,3.5rem)}\n.template-index main .shopify-section+.shopify-section{margin-top:var(--mmg-guided-section-gap)}\n.template-index main :is(h1,h2,h3){text-wrap:balance}\n.template-index main :is(p,li){text-wrap:pretty}\n@media(max-width:749px){.template-index main .page-width{padding-left:max(1rem,env(safe-area-inset-left));padding-right:max(1rem,env(safe-area-inset-right))}.template-index main :is(button,.button,a.button){min-height:44px}}\n`;
  const replacement = `${stylesheet.value.replace(/\s+$/, "")}\n\n${css}`;

  return json({
    summary: "Apply a bounded homepage-only guided-experience baseline using the verified .template-index scope.",
    recommendedChanges: ["Add consistent homepage section spacing.", "Improve text wrapping.", "Preserve mobile safe areas and accessible control height."],
    affectedAssets: [stylesheet.key],
    expectedBenefits: ["Clearer homepage progression.", "Improved mobile readability.", "No intended impact outside the homepage."],
    risks: ["Existing section-specific spacing may require visual review."],
    rollbackPlan: [`Restore the exact pre-change version of ${stylesheet.key}.`],
    acceptanceCriteria: ["Homepage spacing is consistent.", "No mobile horizontal overflow.", "Non-homepage templates remain unchanged."],
    mutationPlan: { themeId, files: [{ key: stylesheet.key, value: replacement, expectedSha256: sha(stylesheet.value) }] },
    actionID: randomUUID(), completedAt: new Date().toISOString(), requestId: randomUUID(), auditId: randomUUID(),
    sourceEvidence: { adapter: "graphql-admin-verified-homepage-direct-v5", themeId, themeName: theme.name || "Published theme", role: "main", homepageSelector: ".template-index", objective, authSource: shop.authSource, files: [{ key: layout.key, sha256: sha(layout.value) }, { key: stylesheet.key, sha256: sha(stylesheet.value) }] },
  });
}

async function shopify(env) {
  const domain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const version = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!domain.endsWith(".myshopify.com")) throw problem(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");

  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  let token = "";
  let authSource = "static-admin-token";

  if (clientId && clientSecret) {
    const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    });
    const result = await response.json().catch(() => ({}));
    token = String(result.access_token || "").trim();
    if (!response.ok || !token) throw problem(401, "shopify_credentials_invalid", String(result.error_description || result.error || "Shopify client credentials were rejected.").slice(0, 500));
    authSource = "client-credentials";
  } else {
    token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  }

  if (!token) throw problem(503, "shopify_not_configured", "Shopify credentials are not configured.");
  return { domain, version, token, authSource };
}

async function gql(shop, query, variables = {}) {
  const response = await fetch(`https://${shop.domain}/admin/api/${shop.version}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": shop.token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.errors?.map?.(error => error?.message).filter(Boolean).join("; ") || body?.error_description || body?.error || `Shopify GraphQL returned HTTP ${response.status}.`;
    throw problem(response.status, response.status === 401 ? "shopify_graphql_unauthorized" : "shopify_graphql_http_error", String(detail).slice(0, 500));
  }
  if (body.errors?.length) throw problem(502, "shopify_graphql_error", body.errors.map(error => error.message).join("; "));
  return body.data;
}

async function bodyText(body) {
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") return Buffer.from(body.contentBase64, "base64").toString("utf8");
  if (typeof body?.url === "string") { const response = await fetch(body.url); return response.ok ? response.text() : undefined; }
}

function sha(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function problem(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": "theme-plan-direct-v5" } }); }
