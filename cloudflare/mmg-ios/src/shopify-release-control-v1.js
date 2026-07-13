const BUILD = "shopify-release-control-20260712-1";
const TTL_SECONDS = 60 * 60 * 24;
const TIMEOUT_MS = 30000;
const tokenCache = new Map();

export async function handleReleaseControlRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/shopify/release/prepare" && request.method === "POST") return prepareRelease(request, env);
  if (url.pathname === "/api/shopify/release/publish" && request.method === "POST") return publishRelease(request, env);
  if (url.pathname === "/api/shopify/release/rollback" && request.method === "POST") return rollbackRelease(request, env);
  const match = url.pathname.match(/^\/api\/shopify\/release\/records\/([a-f0-9-]+)$/i);
  if (match && request.method === "GET") return readRelease(request, match[1]);
  return null;
}

async function prepareRelease(request, env) {
  const body = await request.json();
  const reviewID = String(body?.reviewID || "").trim();
  if (!reviewID) return json(error("review_id_required", "An approved visual review ID is required."), 400);
  const reviewResponse = await caches.default.match(reviewRequest(request, reviewID));
  if (!reviewResponse) return json(error("visual_review_not_found", "The approved visual review expired or was not found."), 404);
  const review = await reviewResponse.json();
  if (review?.executiveDecision?.decision !== "approved" || review?.status !== "visual-review-approved") {
    return json(error("visual_approval_required", "Executive visual approval is required before release preparation."), 409);
  }

  const themes = await readThemes(env);
  const targetID = gid(review?.preview?.themeID);
  const staging = themes.find(theme => theme.id === targetID && theme.role !== "MAIN");
  const live = themes.find(theme => theme.role === "MAIN");
  if (!staging) return json(error("staging_theme_changed", "The visually approved staging theme is no longer an unpublished theme."), 409);
  if (!live) return json(error("live_theme_not_found", "The current live Shopify theme could not be verified."), 409);
  if (staging.processing || staging.processingFailed) return json(error("staging_theme_not_ready", "The approved staging theme is still processing or failed processing."), 409);

  const releaseID = crypto.randomUUID();
  const record = {
    releaseID,
    reviewID,
    status: "awaiting-publication-approval",
    build: BUILD,
    createdAt: new Date().toISOString(),
    platform: "cloudflare-and-shopify",
    targetTheme: summarize(staging),
    previousLiveTheme: summarize(live),
    visualReview: {
      decision: review.executiveDecision,
      checkedAt: review.checkedAt,
      automatedChecks: review.automatedChecks,
      pageEvidence: review.pageEvidence,
    },
    safeguards: {
      explicitApprovalRequired: true,
      expectedConfirmation: "PUBLISH APPROVED STAGING",
      rollbackThemeID: live.id,
      liveVerificationRequired: true,
      cloudflareAuthoritative: true,
      vercelIgnored: true,
    },
    publication: null,
    rollback: null,
  };
  await saveRelease(request, record);
  return json(record, 201);
}

async function publishRelease(request, env) {
  const body = await request.json();
  const releaseID = String(body?.releaseID || "").trim();
  const confirmation = String(body?.confirmation || "").trim();
  if (!releaseID) return json(error("release_id_required", "Release ID is required."), 400);
  if (confirmation !== "PUBLISH APPROVED STAGING") return json(error("publication_confirmation_required", "Type PUBLISH APPROVED STAGING to authorize publication."), 403);
  const record = await loadRelease(request, releaseID);
  if (!record) return json(error("release_not_found", "The release record expired or was not found."), 404);
  if (record.status !== "awaiting-publication-approval") return json(error("release_state_invalid", "This release is not awaiting publication approval."), 409);

  const before = await readThemes(env);
  const currentLive = before.find(theme => theme.role === "MAIN");
  const target = before.find(theme => theme.id === record.targetTheme.id);
  if (!target || target.role === "MAIN") return json(error("release_target_invalid", "The approved staging theme is unavailable or already live."), 409);
  if (!currentLive || currentLive.id !== record.previousLiveTheme.id) return json(error("live_theme_changed", "The live theme changed after release preparation. Prepare a new release."), 409);

  const mutation = await publishTheme(env, target.id);
  const after = await readThemes(env);
  const newLive = after.find(theme => theme.role === "MAIN");
  const previous = after.find(theme => theme.id === record.previousLiveTheme.id);
  if (!newLive || newLive.id !== target.id) return json(error("publication_verification_failed", "Shopify did not report the approved staging theme as live."), 502);
  if (!previous || previous.role === "MAIN") return json(error("previous_theme_role_invalid", "The previous live theme did not move out of the MAIN role."), 502);

  const liveProbe = await probeLive(env);
  const updated = {
    ...record,
    status: liveProbe.ok ? "published-and-verified" : "published-needs-attention",
    publication: {
      approvedBy: String(body?.actor || "Executive").slice(0, 120),
      approvedAt: new Date().toISOString(),
      confirmation,
      mutation,
      newLiveTheme: summarize(newLive),
      previousLiveTheme: summarize(previous),
      liveProbe,
    },
    nextAction: liveProbe.ok ? "Monitor the live storefront. Rollback remains available through Release Control." : "Review the live storefront immediately or execute the approved rollback.",
  };
  await saveRelease(request, updated);
  return json(updated, liveProbe.ok ? 200 : 202);
}

async function rollbackRelease(request, env) {
  const body = await request.json();
  const releaseID = String(body?.releaseID || "").trim();
  const confirmation = String(body?.confirmation || "").trim();
  if (!releaseID) return json(error("release_id_required", "Release ID is required."), 400);
  if (confirmation !== "ROLL BACK LIVE THEME") return json(error("rollback_confirmation_required", "Type ROLL BACK LIVE THEME to authorize rollback."), 403);
  const record = await loadRelease(request, releaseID);
  if (!record) return json(error("release_not_found", "The release record expired or was not found."), 404);
  if (!record.publication) return json(error("release_not_published", "This release has not been published."), 409);

  const themes = await readThemes(env);
  const currentLive = themes.find(theme => theme.role === "MAIN");
  const rollbackTarget = themes.find(theme => theme.id === record.previousLiveTheme.id);
  if (!rollbackTarget) return json(error("rollback_theme_missing", "The previous live theme is no longer available."), 409);
  if (!currentLive || currentLive.id !== record.targetTheme.id) return json(error("live_theme_changed", "The current live theme no longer matches this release. Automatic rollback is blocked."), 409);

  const mutation = await publishTheme(env, rollbackTarget.id);
  const after = await readThemes(env);
  const restored = after.find(theme => theme.role === "MAIN");
  if (!restored || restored.id !== rollbackTarget.id) return json(error("rollback_verification_failed", "Shopify did not restore the previous live theme."), 502);
  const liveProbe = await probeLive(env);
  const updated = {
    ...record,
    status: liveProbe.ok ? "rolled-back-and-verified" : "rolled-back-needs-attention",
    rollback: {
      approvedBy: String(body?.actor || "Executive").slice(0, 120),
      approvedAt: new Date().toISOString(),
      confirmation,
      mutation,
      restoredLiveTheme: summarize(restored),
      liveProbe,
    },
    nextAction: liveProbe.ok ? "The previous live theme is restored and verified." : "The previous theme was restored, but the live probe needs immediate review.",
  };
  await saveRelease(request, updated);
  return json(updated, liveProbe.ok ? 200 : 202);
}

async function readRelease(request, releaseID) {
  const record = await loadRelease(request, releaseID);
  return record ? json(record) : json(error("release_not_found", "The release record expired or was not found."), 404);
}

async function readThemes(env) {
  const data = await shopify(env, `query KairosReleaseThemes { themes(first: 20) { nodes { id name role processing processingFailed updatedAt } } }`, {});
  return Array.isArray(data?.themes?.nodes) ? data.themes.nodes : [];
}

async function publishTheme(env, id) {
  const data = await shopify(env, `mutation KairosThemePublish($id: ID!) { themePublish(id: $id) { theme { id name role processing processingFailed updatedAt } userErrors { field message } } }`, { id });
  const payload = data?.themePublish;
  const errors = Array.isArray(payload?.userErrors) ? payload.userErrors.filter(item => item?.message) : [];
  if (errors.length) throw Object.assign(new Error(errors.map(item => item.message).join("; ")), { statusCode: 422, code: "theme_publish_rejected" });
  if (!payload?.theme?.id) throw Object.assign(new Error("Shopify did not confirm theme publication."), { statusCode: 502, code: "theme_publish_unconfirmed" });
  return payload;
}

async function probeLive(env) {
  const store = String(env.SHOPIFY_STORE_DOMAIN || "07kd8e-qw.myshopify.com").trim().toLowerCase();
  const started = Date.now();
  try {
    const response = await fetch(`https://${store}/`, { redirect: "follow", headers: { "User-Agent": "Kairos-Release-Control/1.0", Accept: "text/html" }, signal: AbortSignal.timeout(20000) });
    const type = response.headers.get("content-type") || "";
    const html = type.includes("text/html") ? await response.text() : "";
    return { ok: response.ok && Boolean(html), status: response.status, finalURL: response.url, contentType: type, bytes: html.length, latencyMs: Date.now() - started, title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim() };
  } catch (cause) {
    return { ok: false, status: 0, latencyMs: Date.now() - started, error: cause instanceof Error ? cause.message : "Live storefront probe failed." };
  }
}

async function shopify(env, query, variables) {
  const store = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const version = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(store)) throw Object.assign(new Error("Shopify store domain is invalid."), { statusCode: 503, code: "shopify_invalid_domain" });
  const auth = await accessToken(env, store);
  const response = await fetch(`https://${store}/admin/api/${version}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await safeJSON(response);
  if (!response.ok) throw Object.assign(new Error(body?.errors?.[0]?.message || `Shopify returned HTTP ${response.status}.`), { statusCode: response.status, code: "shopify_graphql_http_error" });
  if (Array.isArray(body?.errors) && body.errors.length) throw Object.assign(new Error(body.errors.map(item => item?.message).filter(Boolean).join("; ")), { statusCode: 422, code: "shopify_graphql_error" });
  return body?.data || {};
}

async function accessToken(env, store) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const key = `${store}:${clientId}`;
    const cached = tokenCache.get(key);
    if (cached?.expiresAt > Date.now()) return cached;
    const response = await fetch(`https://${store}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await safeJSON(response);
    if (!response.ok || !body?.access_token) throw Object.assign(new Error(body?.error_description || body?.error || "Shopify client credentials were rejected."), { statusCode: 401, code: "shopify_client_credentials_invalid" });
    const value = { token: String(body.access_token), expiresAt: Date.now() + 55 * 60 * 1000 };
    tokenCache.set(key, value);
    return value;
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw Object.assign(new Error("Shopify credentials are not configured."), { statusCode: 503, code: "shopify_not_configured" });
  return { token, expiresAt: Number.MAX_SAFE_INTEGER };
}

function summarize(theme) { return { id: theme.id, name: String(theme.name || ""), role: String(theme.role || ""), processing: Boolean(theme.processing), processingFailed: Boolean(theme.processingFailed), updatedAt: theme.updatedAt || null }; }
function gid(value) { const digits = String(value || "").match(/(\d+)(?!.*\d)/)?.[1]; return digits ? `gid://shopify/OnlineStoreTheme/${digits}` : String(value || ""); }
function releaseRequest(request, releaseID) { const origin = new URL(request.url).origin; return new Request(`${origin}/__kairos/release/${releaseID}`); }
function reviewRequest(request, reviewID) { const origin = new URL(request.url).origin; return new Request(`${origin}/__kairos/visual-review/${reviewID}`); }
async function saveRelease(request, record) { await caches.default.put(releaseRequest(request, record.releaseID), new Response(JSON.stringify(record), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${TTL_SECONDS}` } })); }
async function loadRelease(request, releaseID) { const cached = await caches.default.match(releaseRequest(request, releaseID)); return cached ? cached.json() : null; }
async function safeJSON(response) { try { return await response.json(); } catch { return {}; } }
function decode(value) { return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function error(code, message) { return { status: "failed", build: BUILD, error: { code, message } }; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
