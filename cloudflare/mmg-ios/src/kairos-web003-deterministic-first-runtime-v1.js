import deterministicCopyPlanner, { KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD } from "./kairos-homepage-deterministic-copy-planner-v1.js";
import deterministicMarkupPlanner, { KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD } from "./kairos-homepage-deterministic-markup-copy-planner-v1.js";
import { prepareWebsiteRetoolExceptions } from "./kairos-website-retool-exception-planner-v1.js";
import { buildCompositePlan } from "./kairos-web003-composite-runtime-v1.js";

export const KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD = "kairos-web003-deterministic-first-runtime-20260717-2";

const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const PLAIN_TEXT_FALLBACK_CODES = new Set([
  "deterministic_visible_copy_missing",
  "deterministic_visible_copy_delta_missing",
]);

export async function handleDeterministicFirstWeb003Request(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PLAN_ROUTE) return null;
  const payload = await safeJSON(request.clone());
  if (!isExplicitCompositeRetool(payload)) return null;

  try {
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
    const planned = await deterministicTextPlan(makeRequest(request, textPayload), env, ctx);
    const textResult = planned.result;
    textResult.objective = String(payload?.objective || "").trim();
    const visibleChanges = Array.isArray(textResult?.plan?.changes) ? textResult.plan.changes.filter(change => change?.changeType !== "no-change") : [];
    if (!visibleChanges.length) throw httpError(409, "deterministic_visible_copy_delta_missing", "Kairos did not produce a visible homepage copy change, so it will not build an unchanged preview.");

    const exceptionPlan = await prepareWebsiteRetoolExceptions(request, env);
    if (exceptionPlan?.stagingTheme?.gid !== textResult?.plan?.targetTheme?.gid) {
      throw httpError(409, "deterministic_composite_target_mismatch", "The deterministic homepage copy plan and native header/footer inspection do not target the same Kairos Staging theme.");
    }

    const result = buildCompositePlan(textResult, exceptionPlan);
    result.build = KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD;
    result.kernel = "deterministic-source-bound-copy-plus-native-theme-plan-v2";
    result.objective = String(payload?.objective || "").trim();
    result.summary = "Kairos prepared verified visible homepage copy replacements plus bounded native Shopify header and footer settings for staging approval.";
    result.plan.summary = result.summary;
    result.plan.strategy = planned.source === "embedded-template-markup"
      ? "Rewrite visible heading and paragraph nodes inside the active published homepage HTML or Liquid setting, then layer only explicitly selected native header/footer settings onto the same non-live staging theme."
      : "Rewrite active plain published homepage text settings, then layer only explicitly selected native header/footer settings onto the same non-live staging theme.";
    result.plan.sourceBoundCopyComposite = true;
    result.plan.deterministicFirst = true;
    result.plan.deterministicTextSource = planned.source;
    result.plan.canonicalPackage = null;
    result.plan.preserveExistingDesign = true;
    result.plan.preservePublishedFramework = true;
    result.plan.visibleTextDeltaRequired = true;
    result.plan.structuralMutationAuthorized = false;
    result.plan.styleMutationAuthorized = true;
    result.plan.mutationScope = `deterministic-${planned.source}-copy-plus-selected-native-header-footer-settings`;
    result.plan.compositePackage = {
      ...(result.plan.compositePackage || {}),
      canonicalFiles: [],
      sourceBoundCopyFiles: [...new Set(visibleChanges.map(change => change.filename).filter(Boolean))],
      sourceBoundCopyRequired: true,
      deterministicFirst: true,
      deterministicTextSource: planned.source,
      canonicalHomepageInstallation: false,
      stagingOnly: true,
    };
    result.evidence = {
      ...(result.evidence || {}),
      sourceBoundCopyComposite: true,
      deterministicFirst: true,
      deterministicTextSource: planned.source,
      deterministicPlannerBuild: planned.build,
      plainTextPlannerBuild: KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD,
      embeddedMarkupPlannerBuild: KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD,
      visibleTextChangeCount: Number(textResult?.evidence?.visibleTextReplacementCount || textResult?.evidence?.replacementCount || visibleChanges.length),
      canonicalHomepageInstallation: false,
      modelPlanningRequired: false,
    };

    return completed(result);
  } catch (error) {
    return json({
      status: Number(error?.status || 500) >= 500 ? "failed" : "needs-attention",
      build: KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD,
      error: { code: error?.code || "deterministic_first_web003_failed", message: error instanceof Error ? error.message : "Kairos deterministic homepage planning failed." },
      safeguards: { liveThemeChanged: false, stagingOnly: true, unchangedPreviewProhibited: true },
    }, Number(error?.status || 500));
  }
}

async function deterministicTextPlan(request, env, ctx) {
  const plainResponse = await deterministicCopyPlanner.fetch(request.clone(), env, ctx);
  const plainBody = await safeJSON(plainResponse.clone());
  if (plainResponse.ok && plainBody?.result?.planID) {
    return { result: plainBody.result, source: "plain-template-settings", build: KAIROS_HOMEPAGE_DETERMINISTIC_COPY_PLANNER_BUILD };
  }
  const plainCode = String(plainBody?.error?.code || "");
  if (!PLAIN_TEXT_FALLBACK_CODES.has(plainCode)) {
    throw httpError(plainResponse.status || 502, plainCode || "deterministic_copy_plan_failed", plainBody?.error?.message || "Kairos could not prepare deterministic homepage copy replacements.");
  }

  const markupResponse = await deterministicMarkupPlanner.fetch(request, env, ctx);
  const markupBody = await safeJSON(markupResponse.clone());
  if (!markupResponse.ok || !markupBody?.result?.planID) {
    throw httpError(markupResponse.status || 502, markupBody?.error?.code || "deterministic_markup_copy_plan_failed", markupBody?.error?.message || "Kairos could not prepare deterministic embedded homepage copy replacements.");
  }
  return { result: markupBody.result, source: "embedded-template-markup", build: KAIROS_HOMEPAGE_DETERMINISTIC_MARKUP_COPY_PLANNER_BUILD };
}

function isExplicitCompositeRetool(payload) {
  return String(payload?.requestType || payload?.intent || "").toLowerCase() === "full-retool"
    && payload?.fullRetoolConfirmed === true
    && payload?.structuralMutationAuthorized === true
    && payload?.styleMutationAuthorized === true
    && payload?.contentOnlyLocked !== true;
}

function makeRequest(request, payload) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Request(request.url, { method: "POST", headers, body: JSON.stringify(payload), redirect: request.redirect });
}

function completed(result) {
  const now = new Date().toISOString();
  const jobID = crypto.randomUUID();
  return json({ jobID, status: "completed", build: KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary: result.summary, result }, 202);
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

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_WEB003_DETERMINISTIC_FIRST_BUILD,
      "X-Kairos-WEB-003": "deterministic-source-bound-copy-plus-native-theme",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
