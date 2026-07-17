import renderedTextPlanner from "./kairos-rendered-homepage-text-planner-v1.js";
import templateMarkupPlanner from "./kairos-homepage-template-markup-text-planner-v1.js";
import liquidFallback from "./kairos-homepage-liquid-text-fallback-v1.js";
import instanceFallback from "./kairos-homepage-instance-liquid-fallback-v1.js";
import templateTextExecutor from "./kairos-homepage-template-text-executor-v1.js";
import instanceExecutor from "./kairos-homepage-instance-liquid-executor-v2.js";
import { prepareWebsiteRetoolExceptions } from "./kairos-website-retool-exception-planner-v1.js";
import { executeWebsiteRetoolExceptions } from "./kairos-website-retool-exception-executor-v1.js";
import { buildCompositePlan, mergeCompositeExecution } from "./kairos-web003-composite-runtime-v1.js";

export const KAIROS_WEB003_SOURCE_BOUND_COMPOSITE_BUILD = "kairos-web003-source-bound-composite-runtime-20260717-1";

const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const EXECUTE_ROUTE = "/api/shopify/staging/execute/jobs";
const ROLLBACK_ROUTE = "/api/shopify/staging/rollback/jobs";
const PRIMARY_FALLBACK_CODES = new Set([
  "rendered_homepage_text_delta_missing",
  "published_homepage_text_settings_missing",
  "safe_template_text_changes_missing",
]);
const MARKUP_FALLBACK_CODES = new Set([
  "embedded_template_markup_text_missing",
  "safe_embedded_markup_text_changes_missing",
  "embedded_markup_text_patch_empty",
]);
const INSTANCE_FALLBACK_CODES = new Set([
  "homepage_liquid_scope_unsafe",
  "homepage_liquid_section_missing",
  "homepage_liquid_visible_text_missing",
  "safe_liquid_text_changes_missing",
  "liquid_text_patch_empty",
]);

export async function handleSourceBoundWeb003Request(request, env, ctx, delegate) {
  const url = new URL(request.url);
  try {
    if (request.method === "POST" && url.pathname === PLAN_ROUTE) {
      const payload = await safeJSON(request.clone());
      if (!isExplicitCompositeRetool(payload)) return null;
      return createSourceBoundCompositePlan(request, payload, env, ctx);
    }

    if (request.method === "POST" && url.pathname === EXECUTE_ROUTE) {
      const payload = await safeJSON(request.clone());
      if (payload?.plan?.plan?.sourceBoundCopyComposite !== true) return null;
      return executeSourceBoundCompositePlan(request, payload, env, ctx, delegate);
    }

    return null;
  } catch (error) {
    return json({
      status: Number(error?.status || 500) >= 500 ? "failed" : "needs-attention",
      build: KAIROS_WEB003_SOURCE_BOUND_COMPOSITE_BUILD,
      error: {
        code: error?.code || "source_bound_web003_failed",
        message: error instanceof Error ? error.message : "Kairos could not complete the source-bound website preview.",
      },
      safeguards: {
        liveThemeChanged: false,
        sourceBoundVisibleCopyRequired: true,
        stagingOnly: true,
      },
    }, Number(error?.status || 500));
  }
}

async function createSourceBoundCompositePlan(request, payload, env, ctx) {
  const textPayload = {
    ...payload,
    requestType: "homepage-preserve-design",
    intent: "homepage-preserve-design",
    homepageMode: "preserve-published-framework",
    preserveExistingDesign: true,
    preservePublishedFramework: true,
    renderedTextRequired: true,
    contentOnlyLocked: true,
    literalOnly: true,
    fullRetoolConfirmed: false,
    structuralMutationAuthorized: false,
    styleMutationAuthorized: false,
  };

  const textResult = await createSourceBoundTextPlan(makeRequest(request, textPayload), env, ctx);
  const visibleChanges = Array.isArray(textResult?.plan?.changes)
    ? textResult.plan.changes.filter(change => !["no-change", "native-theme-exception-candidate"].includes(change?.changeType))
    : [];
  if (!visibleChanges.length) {
    throw httpError(409, "source_bound_visible_copy_delta_missing", "Kairos did not produce a rendered homepage text change, so it will not build an unchanged preview.");
  }

  const exceptionPlan = await prepareWebsiteRetoolExceptions(request, env);
  if (exceptionPlan?.stagingTheme?.gid !== textResult?.plan?.targetTheme?.gid) {
    throw httpError(409, "source_bound_composite_target_mismatch", "The homepage text plan and native header/footer inspection do not target the same Kairos Staging theme.");
  }

  const result = buildCompositePlan(textResult, exceptionPlan);
  result.build = KAIROS_WEB003_SOURCE_BOUND_COMPOSITE_BUILD;
  result.kernel = "source-bound-copy-plus-native-theme-plan-v1";
  result.summary = "Kairos prepared real source-bound homepage copy replacements plus the explicitly selected native Shopify header and footer settings.";
  result.plan.summary = result.summary;
  result.plan.strategy = "Rewrite verified rendered customer-facing homepage text in the published framework, then layer only the approved native header/footer settings onto the same non-live staging theme.";
  result.plan.sourceBoundCopyComposite = true;
  result.plan.canonicalPackage = null;
  result.plan.preserveExistingDesign = true;
  result.plan.preservePublishedFramework = true;
  result.plan.visibleTextDeltaRequired = true;
  result.plan.structuralMutationAuthorized = false;
  result.plan.styleMutationAuthorized = true;
  result.plan.mutationScope = "source-bound-visible-copy-plus-selected-native-header-footer-settings";
  result.plan.compositePackage = {
    ...(result.plan.compositePackage || {}),
    canonicalFiles: [],
    sourceBoundCopyFiles: [...new Set(visibleChanges.map(change => change.filename).filter(Boolean))],
    sourceBoundCopyRequired: true,
    canonicalHomepageInstallation: false,
    stagingOnly: true,
  };
  result.evidence = {
    ...(result.evidence || {}),
    sourceBoundCopyComposite: true,
    visibleTextChangeCount: visibleChanges.length,
    canonicalHomepageInstallation: false,
  };

  return completed(result);
}

async function createSourceBoundTextPlan(request, env, ctx) {
  const primary = await renderedTextPlanner.fetch(request.clone(), env, ctx);
  const primaryBody = await safeJSON(primary.clone());
  if (primary.ok) return requireResult(primaryBody, "rendered homepage text planner");
  if (!PRIMARY_FALLBACK_CODES.has(String(primaryBody?.error?.code || ""))) throw responseError(primary, primaryBody);

  const embedded = await templateMarkupPlanner.fetch(request.clone(), env, ctx);
  const embeddedBody = await safeJSON(embedded.clone());
  if (embedded.ok) return requireResult(embeddedBody, "embedded homepage markup planner");
  if (!MARKUP_FALLBACK_CODES.has(String(embeddedBody?.error?.code || ""))) throw responseError(embedded, embeddedBody);

  const liquid = await liquidFallback.fetch(request.clone(), env, ctx);
  const liquidBody = await safeJSON(liquid.clone());
  if (liquid.ok) return requireResult(liquidBody, "homepage Liquid text planner");
  if (!INSTANCE_FALLBACK_CODES.has(String(liquidBody?.error?.code || ""))) throw responseError(liquid, liquidBody);

  const instance = await instanceFallback.fetch(request, env, ctx);
  const instanceBody = await safeJSON(instance.clone());
  if (!instance.ok) throw responseError(instance, instanceBody);
  return requireResult(instanceBody, "homepage instance text planner");
}

async function executeSourceBoundCompositePlan(request, payload, env, ctx, delegate) {
  const selectedChanges = Array.isArray(payload?.websiteRetool?.selectedChanges) ? payload.websiteRetool.selectedChanges : [];
  const nativeThemeDecision = String(payload?.websiteRetool?.nativeThemeDecision || "").trim();
  validateNativeDecision(nativeThemeDecision, selectedChanges);

  const textResponse = await executeTextPlan(request, payload, env, ctx);
  const textBody = await safeJSON(textResponse.clone());
  if (!textResponse.ok) return textResponse;
  const textResult = requireResult(textBody, "source-bound homepage text executor");
  if (textResult?.status !== "completed" || !textResult?.execution?.targetTheme?.gid || !textResult?.rollback) {
    throw httpError(502, "source_bound_text_execution_receipt_missing", "The homepage text execution did not return a verified staging receipt and rollback package.");
  }

  let nativeResult = null;
  if (selectedChanges.length) {
    try {
      nativeResult = await executeWebsiteRetoolExceptions(request, env, {
        plan: payload.plan.plan.websiteRetoolExceptions,
        approval: {
          status: "approved",
          approvedAt: payload?.approval?.approvedAt || new Date().toISOString(),
          targetThemeID: textResult.execution.targetTheme.gid,
        },
        selectedChanges,
      });
    } catch (error) {
      const recovery = await rollbackTextExecution(request, textResult.rollback, delegate);
      const restored = recovery?.response?.ok && recovery?.body?.status === "completed";
      const failure = httpError(
        502,
        restored ? "native_theme_failed_text_auto_restored" : "source_bound_composite_recovery_required",
        restored
          ? `${safeMessage(error)} Kairos restored the homepage text staging changes, so no partial preview remains.`
          : `${safeMessage(error)} The homepage text rollback also needs attention.`,
      );
      failure.recovery = { nativeTheme: error?.recovery || null, homepageText: recovery?.body || null, fullyRestored: restored };
      throw failure;
    }
  }

  const result = mergeCompositeExecution(textResult, nativeResult, nativeThemeDecision);
  result.build = KAIROS_WEB003_SOURCE_BOUND_COMPOSITE_BUILD;
  result.kernel = "source-bound-copy-plus-native-theme-execution-v1";
  result.summary = nativeResult
    ? "Kairos wrote and verified the requested homepage copy replacements and selected native header/footer settings on Kairos Staging."
    : "Kairos wrote and verified the requested homepage copy replacements on Kairos Staging while preserving the current native theme settings.";
  result.execution = {
    ...(result.execution || {}),
    engine: "source-bound-copy-plus-native-theme-v1",
    sourceBoundCopyComposite: true,
    canonicalHomepageInstalled: false,
    stagingOnly: true,
  };
  result.evidence = {
    ...(result.evidence || {}),
    sourceBoundCopyComposite: true,
    canonicalHomepageInstalled: false,
  };

  return completed(result);
}

async function executeTextPlan(request, payload, env, ctx) {
  const mode = String(payload?.plan?.plan?.installationMode || "");
  const cleanPayload = { plan: payload.plan, approval: payload.approval };
  const next = makeRequest(request, cleanPayload);
  if (mode === "published-main-template-text-settings-v1") return templateTextExecutor.fetch(next, env, ctx);
  if (mode === "published-main-liquid-visible-text-v1") return liquidFallback.fetch(next, env, ctx);
  if (mode === "published-main-homepage-instance-liquid-text-v1") return instanceExecutor.fetch(next, env, ctx);
  throw httpError(409, "source_bound_text_mode_invalid", `Unsupported source-bound homepage text mode: ${mode || "missing"}.`);
}

async function rollbackTextExecution(request, rollback, delegate) {
  const response = await delegate(makeRequest(new Request(new URL(ROLLBACK_ROUTE, request.url), request), {
    rollback,
    approval: {
      status: "approved",
      approvedAt: new Date().toISOString(),
      targetThemeID: rollback.targetThemeID,
      currentHashes: rollback.currentHashes || {},
      expectedCurrentHashes: rollback.currentHashes || {},
      reason: "Automatic recovery after native header/footer staging failure",
    },
  }));
  return { response, body: await safeJSON(response.clone()) };
}

function validateNativeDecision(decision, selectedChanges) {
  if (selectedChanges.length && decision !== "approved-selection") {
    throw httpError(403, "native_theme_selection_approval_required", "Approve the exact native header/footer selections before building the preview.");
  }
  if (!selectedChanges.length && decision !== "keep-current") {
    throw httpError(403, "native_theme_decision_required", "Explicitly keep the current native theme or approve at least one exact header/footer selection.");
  }
}

function isExplicitCompositeRetool(payload) {
  return String(payload?.requestType || payload?.intent || "").toLowerCase() === "full-retool"
    && payload?.fullRetoolConfirmed === true
    && payload?.structuralMutationAuthorized === true
    && payload?.styleMutationAuthorized === true
    && payload?.contentOnlyLocked !== true;
}

function requireResult(body, source) {
  const result = body?.result;
  if (!result?.planID && result?.status !== "completed") {
    throw httpError(502, "source_bound_result_missing", `The ${source} did not return a completed source-bound result.`);
  }
  return result;
}

function responseError(response, body) {
  return httpError(response.status || 502, body?.error?.code || "source_bound_planner_failed", body?.error?.message || body?.summary || "The source-bound homepage planner failed.");
}

function completed(result) {
  const now = new Date().toISOString();
  const jobID = crypto.randomUUID();
  return json({
    jobID,
    status: "completed",
    build: KAIROS_WEB003_SOURCE_BOUND_COMPOSITE_BUILD,
    submittedAt: now,
    updatedAt: now,
    completedAt: now,
    summary: result.summary,
    result,
  }, 202);
}

function makeRequest(request, payload) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Request(request.url, { method: "POST", headers, body: JSON.stringify(payload), redirect: request.redirect });
}

async function safeJSON(response) {
  try { return await response.json(); } catch { return {}; }
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function safeMessage(error) {
  return error instanceof Error && error.message ? error.message.slice(0, 1600) : "The native header/footer staging operation failed.";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_WEB003_SOURCE_BOUND_COMPOSITE_BUILD,
      "X-Kairos-WEB-003": "source-bound-copy-plus-native-theme",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
