const BUILD = "shopify-visual-verification-20260716-3";
const REVIEW_TTL_SECONDS = 60 * 60 * 24;

export async function handleVisualVerificationRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/shopify/staging/visual-verification" && request.method === "POST") return createVerification(request, env);
  if (url.pathname === "/api/shopify/staging/visual-approval" && request.method === "POST") return approveVerification(request);
  return null;
}

async function createVerification(request, env) {
  const body = await request.json();
  const result = body?.result || {};
  const execution = body?.execution || result?.execution || {};
  const theme = execution?.targetTheme || body?.targetTheme || {};
  const themeID = numericThemeID(theme?.gid || theme?.id || body?.themeID);
  if (!themeID) return json({ status: "needs-input", error: { code: "staging_theme_required", message: "A verified Shopify staging theme ID is required." } }, 400);

  const store = String(env.SHOPIFY_STOREFRONT_DOMAIN || env.SHOPIFY_STORE_DOMAIN || body?.shopifyStore || "07kd8e-qw.myshopify.com").trim().toLowerCase();
  const explicitPreview = execution?.preview?.url || result?.preview?.url || body?.previewURL || "";
  const path = normalizePath(execution?.preview?.path || body?.path || pathForRequestType(body?.requestType));
  const previewURL = explicitPreview || `https://${store}${path}${path.includes("?") ? "&" : "?"}preview_theme_id=${encodeURIComponent(themeID)}`;
  const reviewID = crypto.randomUUID();
  const checkedAt = new Date().toISOString();
  const probe = await probePreview(previewURL);
  const pendingAssignment = execution?.pendingLiveAssignment || null;
  const resource = execution?.resource || null;
  const approvedFiles = (Array.isArray(execution?.filesWritten) ? execution.filesWritten : [])
    .map(file => ({
      filename: String(typeof file === "string" ? file : file?.filename || file?.key || "").trim(),
      afterSha256: String(typeof file === "object" ? file?.afterSha256 || file?.actualSha256 || file?.sha256 || "" : "").trim(),
    }))
    .filter(file => file.filename && file.afterSha256);

  const record = {
    reviewID,
    status: "awaiting-executive-visual-review",
    build: BUILD,
    createdAt: checkedAt,
    checkedAt,
    preview: {
      store,
      themeID,
      path,
      url: previewURL,
      desktopURL: previewURL,
      mobileURL: previewURL,
      targetThemeName: String(theme?.name || "Kairos Staging")
    },
    releaseTarget: pendingAssignment ? {
      releaseType: "resource-assignment",
      resourceType: String(pendingAssignment.resourceType || resource?.resourceType || ""),
      resourceID: pendingAssignment.resourceID || resource?.id || null,
      resourceHandle: pendingAssignment.resourceHandle || resource?.handle || "",
      templateSuffix: pendingAssignment.templateSuffix || "",
      createUnpublishedPreviewPage: Boolean(pendingAssignment.createUnpublishedPreviewPage),
      resource,
      stagingTheme: theme,
      publishedTheme: execution?.publishedTheme || null,
      sourceExecutionID: result?.actionID || null,
      sourceBuild: result?.build || null
    } : {
      releaseType: "theme-publication",
      stagingTheme: theme,
      publishedTheme: execution?.publishedTheme || null,
      approvedFiles,
      sourceExecutionID: result?.actionID || null,
      sourceBuild: result?.build || null
    },
    automatedChecks: probe.checks,
    pageEvidence: probe.evidence,
    requiredVisualChecks: [
      "Hero and first viewport communicate the intended objective clearly.",
      "Mobile layout has no horizontal overflow, clipped copy, or unusable controls.",
      "Desktop hierarchy, spacing, and image containment match MMG standards.",
      "Navigation and every visible CTA lead to the intended verified destination.",
      "Kairos guidance is restrained, dismissible, captioned, and does not obstruct content.",
      "No unsupported capability, invented product, fake metric, or placeholder content appears.",
      "The live published storefront remains unchanged before Release Control approval.",
      ...(approvedFiles.some(file => /^(?:sections\/header-group\.json|config\/settings_data\.json)$/.test(file.filename)) ? [
        "The native Shopify announcement bar and header render with the exact approved scheme, branding behavior, navigation, and mobile alignment.",
        "If the logo assignment was cleared, no unintended shop-name fallback, empty brand gap, clipped menu, or inaccessible header state appears.",
      ] : []),
      ...(approvedFiles.some(file => file.filename === "templates/index.json") ? [
        "The native header is followed by the MMG page-title strip and then the canonical homepage hero, with no duplicated hero or title treatment.",
      ] : []),
    ],
    publicationAuthorized: false,
    executiveDecision: null
  };

  await caches.default.put(reviewRequest(request, reviewID), new Response(JSON.stringify(record), {
    headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${REVIEW_TTL_SECONDS}` }
  }));
  return json(record, 201);
}

async function approveVerification(request) {
  const body = await request.json();
  const reviewID = String(body?.reviewID || "").trim();
  const decision = String(body?.decision || "").trim().toLowerCase();
  if (!reviewID) return json({ status: "needs-input", error: { code: "review_id_required", message: "Visual review ID is required." } }, 400);
  if (!["approved","revision-requested","rejected"].includes(decision)) return json({ status: "needs-input", error: { code: "visual_decision_invalid", message: "Choose approved, revision-requested, or rejected." } }, 400);
  const cached = await caches.default.match(reviewRequest(request, reviewID));
  if (!cached) return json({ status: "not-found", error: { code: "visual_review_not_found", message: "The visual review expired or was not found." } }, 404);
  const record = await cached.json();
  const updated = {
    ...record,
    status: decision === "approved" ? "visual-review-approved" : decision,
    executiveDecision: { decision, actor: String(body?.actor || "Executive"), decidedAt: new Date().toISOString(), notes: String(body?.notes || "").slice(0, 2000) },
    publicationAuthorized: false,
    nextAction: decision === "approved" ? "Open Release Control to approve the exact live theme or resource assignment." : "Return the website job to revision; do not publish this staging result."
  };
  await caches.default.put(reviewRequest(request, reviewID), new Response(JSON.stringify(updated), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${REVIEW_TTL_SECONDS}` } }));
  return json(updated);
}

async function probePreview(previewURL) {
  const started = Date.now();
  try {
    const response = await fetch(previewURL, { redirect: "follow", headers: { "User-Agent": "Kairos-Visual-Verification/2.0", "Accept": "text/html" } });
    const contentType = response.headers.get("content-type") || "";
    const html = contentType.includes("text/html") ? await response.text() : "";
    const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
    const h1Count = (html.match(/<h1\b/gi) || []).length;
    const linkCount = (html.match(/<a\b/gi) || []).length;
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    const hasMain = /<main\b/i.test(html) || /id=["']MainContent["']/i.test(html);
    const hasPlaceholder = /lorem ipsum|placeholder text|example\.com/i.test(html);
    return { checks: [
      check("preview_reachable", response.ok, `HTTP ${response.status}`),
      check("html_returned", Boolean(html), contentType || "No HTML content type"),
      check("document_title", Boolean(title), title || "No title detected"),
      check("mobile_viewport", hasViewport, hasViewport ? "Viewport meta detected" : "Viewport meta missing"),
      check("main_landmark", hasMain, hasMain ? "Main content landmark detected" : "Main landmark not detected"),
      check("single_primary_heading", h1Count === 1, `${h1Count} H1 element${h1Count === 1 ? "" : "s"} detected`),
      check("placeholder_scan", !hasPlaceholder, hasPlaceholder ? "Potential placeholder content detected" : "No common placeholder content detected")
    ], evidence: { finalURL: response.url, httpStatus: response.status, contentType, title, h1Count, linkCount, latencyMs: Date.now() - started, bytesInspected: html.length } };
  } catch (error) {
    return { checks: [check("preview_reachable", false, error instanceof Error ? error.message : "Preview could not be reached")], evidence: { finalURL: previewURL, httpStatus: 0, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : "Preview probe failed" } };
  }
}

function check(id, passed, detail) { return { id, passed, status: passed ? "passed" : "needs-review", detail }; }
function numericThemeID(value) { const match = String(value || "").match(/(\d+)(?!.*\d)/); return match?.[1] || ""; }
function normalizePath(value) { const text = String(value || "/").trim(); return text.startsWith("/") ? text : `/${text}`; }
function pathForRequestType(type) { return String(type || "").includes("product") ? "/collections/all" : "/"; }
function reviewRequest(request, reviewID) { const url = new URL(request.url); return new Request(`${url.origin}/__kairos/visual-review/${reviewID}`); }
function decodeEntities(value) { return String(value || "").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
