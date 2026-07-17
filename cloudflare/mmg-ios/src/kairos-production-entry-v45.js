import runtime, { KairosProject } from "./kairos-production-entry-v44.js";
import {
  handleDeterministicFirstWeb003Request,
  KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD,
} from "./kairos-web003-deterministic-first-runtime-v1.js";

const BUILD = "kairos-production-entry-20260717-103";
const DIAGNOSTIC_ROUTE = "/api/website/diagnostics/deterministic-plan";
const COMMAND_CENTER_PREFIX = "/center/";
const DASHBOARD_ASSET_PREFIXES = ["/styles/", "/scripts/", "/images/", "/fonts/"];
const DASHBOARD_ASSET_FILES = new Set(["/favicon.ico", "/manifest.webmanifest", "/apple-touch-icon.png"]);

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if ((request.method === "GET" || request.method === "HEAD") && isDashboardRequest(url.pathname)) {
        const dashboard = await serveDashboardAsset(request, env, url.pathname.startsWith(COMMAND_CENTER_PREFIX));
        if (dashboard) return stamp(dashboard);
      }
      if (request.method === "GET" && url.pathname === DIAGNOSTIC_ROUTE) return diagnosticPlan(request, env, ctx);
      const deterministicPlan = await handleDeterministicFirstWeb003Request(request, env, ctx);
      if (deterministicPlan) return stamp(deterministicPlan);
    } catch (error) {
      return jsonError(
        Number(error?.statusCode || error?.status || 500),
        error?.code || "deterministic_first_web003_edge_failed",
        error instanceof Error ? error.message : "Kairos deterministic website planning failed.",
      );
    }

    let response = await runtime.fetch(request, env, ctx);
    if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) response = await addHealth(response);
    return stamp(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

function isDashboardRequest(pathname) {
  return pathname.startsWith(COMMAND_CENTER_PREFIX)
    || DASHBOARD_ASSET_PREFIXES.some(prefix => pathname.startsWith(prefix))
    || DASHBOARD_ASSET_FILES.has(pathname);
}

async function serveDashboardAsset(request, env, shellRequest) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") return null;
  const assetUrl = new URL(request.url);
  assetUrl.search = "";
  if (shellRequest) assetUrl.pathname = "/index.html";
  const assetRequest = new Request(assetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    redirect: request.redirect,
  });
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Kairos-Command-Center-Route", shellRequest ? "direct-assets-root-shell" : "direct-assets-static");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function diagnosticPlan(request, env, ctx) {
  const target = new URL("/api/shopify/staging/plan/jobs", request.url);
  const payload = {
    objective: "Rewrite the existing published Mindset Media Group homepage customer-facing copy so visitors immediately understand the knowledge, publishing, creator education, digital-product, and professional-service ecosystem. Preserve the existing homepage structure and design. Also prepare bounded native Shopify header dark-blue and footer black color changes for explicit staging approval. Do not publish anything live.",
    requestType: "full-retool",
    intent: "full-retool",
    fullRetoolConfirmed: true,
    structuralMutationAuthorized: true,
    styleMutationAuthorized: true,
    contentOnlyLocked: false,
  };
  const synthetic = new Request(target, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(payload),
  });
  const response = await handleDeterministicFirstWeb003Request(synthetic, env, ctx);
  if (!response) return jsonDiagnostic({ status: "failed", error: { code: "diagnostic_route_unhandled", message: "The deterministic planning edge did not handle the diagnostic request." } }, 500);
  const body = await response.clone().json().catch(() => ({}));
  if (!response.ok || !body?.result) {
    return jsonDiagnostic({ status: body?.status || "failed", build: body?.build || KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD, error: body?.error || { code: "diagnostic_plan_failed", message: "The deterministic planning diagnostic failed." }, safeguards: body?.safeguards || null }, response.status || 500);
  }
  const result = body.result;
  const plan = result.plan || {};
  const sourceOperations = Array.isArray(plan?.templateTextPatch?.operations) ? plan.templateTextPatch.operations : [];
  const templateOperations = sourceOperations.flatMap(operation => {
    const location = operation.location || `${operation.scope}:${operation.sectionId}:${operation.blockId || "section"}:${operation.key}`;
    if (Array.isArray(operation.visibleReplacements) && operation.visibleReplacements.length) {
      return operation.visibleReplacements.map(replacement => ({
        location: `${location}#${replacement.id || "visible-text"}`,
        before: replacement.before,
        after: replacement.after,
        reason: replacement.reason || operation.reason || "",
        kind: replacement.kind || "visible-text",
      }));
    }
    return [{
      location,
      before: operation.before,
      after: operation.after,
      reason: operation.reason || "",
      kind: "plain-setting",
    }];
  });
  const liquidOperations = (Array.isArray(plan?.liquidTextPatches) ? plan.liquidTextPatches : []).flatMap(patch =>
    (Array.isArray(patch?.replacements) ? patch.replacements : []).map(replacement => ({
      location: `${patch.filename}#${replacement.id || "visible-text"}`,
      before: replacement.before,
      after: replacement.after,
      reason: replacement.reason || "",
      kind: replacement.kind || (replacement.primary ? "visible-primary" : "visible-text"),
    })),
  );
  const visibleOperations = [...templateOperations, ...liquidOperations];
  const nativeCandidates = [
    ...(Array.isArray(plan?.websiteRetoolExceptions?.highConfidence) ? plan.websiteRetoolExceptions.highConfidence : []),
    ...(Array.isArray(plan?.websiteRetoolExceptions?.executiveReview) ? plan.websiteRetoolExceptions.executiveReview : []),
  ];
  return jsonDiagnostic({
    status: "completed",
    build: body.build,
    planID: result.planID,
    deterministicFirst: plan.deterministicFirst === true,
    deterministicTextSource: plan.deterministicTextSource || null,
    sourceBoundCopyComposite: plan.sourceBoundCopyComposite === true,
    canonicalPackageExcluded: plan.canonicalPackage === null,
    canonicalHomepageInstallation: plan?.compositePackage?.canonicalHomepageInstallation === true,
    stagingOnly: plan?.compositePackage?.stagingOnly === true,
    operationCount: visibleOperations.length,
    operations: visibleOperations.slice(0, 8),
    sourceSettingOperationCount: sourceOperations.length,
    liquidPatchCount: Array.isArray(plan?.liquidTextPatches) ? plan.liquidTextPatches.length : 0,
    nativeCandidateCount: nativeCandidates.length,
    nativeCandidates: nativeCandidates.slice(0, 12).map(candidate => ({
      filename: candidate.filename,
      category: candidate.category,
      key: candidate.key,
      currentValue: candidate.currentValuePreview ?? candidate.currentValue ?? null,
      proposedValue: candidate.proposedValue ?? null,
      requiresExecutiveApproval: candidate.requiresExecutiveApproval === true,
    })),
    liveThemeChanged: false,
    stagingTheme: plan?.targetTheme?.name || "Kairos Staging",
  });
}

async function addHealth(response) {
  let body;
  try { body = await response.clone().json(); }
  catch { return response; }
  body.build = BUILD;
  body.websiteProduction = {
    ...(body.websiteProduction || {}),
    deterministicFirstComposite: "operational",
    combinedHomepagePlanning: "model-format-independent",
    visibleCopyDeltaBeforePreview: "required",
    deterministicPlanDiagnostic: DIAGNOSTIC_ROUTE,
    commandCenterRoute: "direct-assets-root-shell-and-static",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    deterministicFirstHomepageCopyPlusHeaderFooter: "operational",
    modelFormattedCopyPlanDependency: "retired-for-combined-retool",
    readOnlyDeterministicPlanDiagnostic: "operational",
    commandCenterDirectAssetServing: "operational",
  };
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status: response.status, statusText: response.statusText, headers });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Production-Entry", BUILD);
  headers.set("X-Kairos-Deterministic-WEB-003", KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonDiagnostic(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Production-Entry": BUILD,
      "X-Kairos-Deterministic-WEB-003": KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD,
      "X-Kairos-Diagnostic": "read-only-no-theme-write",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ status: status >= 500 ? "failed" : "needs-attention", build: BUILD, error: { code, message } }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Production-Entry": BUILD,
      "X-Kairos-Deterministic-WEB-003": KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Deployment trigger only: serve the dependency-free Command Center recovery shell from Cloudflare Assets.
