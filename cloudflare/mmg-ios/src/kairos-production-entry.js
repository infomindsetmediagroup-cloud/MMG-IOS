import baseRuntime, { KairosProject } from "./kairos-production-entry-v2.js";
import { restoreApprovedHomepageBaseline } from "./kairos-approved-baseline-restore-v1.js";
import { auditHomepageLinks } from "./kairos-link-lifecycle-engine-v1.js";
import {
  executeHomepageLinkRepair,
  prepareHomepageLinkRepair,
} from "./kairos-link-lifecycle-repair-v2.js";
import {
  decideLifecycleReview,
  executeApprovedLifecycleReview,
  prepareLifecycleReview,
} from "./kairos-link-lifecycle-review-v1.js";
import { inspectWebsiteRetoolSchema } from "./kairos-website-retool-schema-inspector-v1.js";
import { prepareWebsiteRetoolExceptions } from "./kairos-website-retool-exception-planner-v1.js";
import {
  executeWebsiteRetoolExceptions,
  rollbackWebsiteRetoolExceptions,
} from "./kairos-website-retool-exception-executor-v1.js";
import {
  readLatestWebsiteIntelligenceReport,
  runWebsiteIntelligenceSupervisor,
} from "./kairos-website-intelligence-supervisor-v1.js";

const BUILD = "kairos-production-baseline-20260713-1";
const CANONICAL_PREFIX = "kairos-canonical-homepage";
const STAGING_PLAN_PATH = "/api/shopify/staging/plan/jobs";
const STAGING_EXECUTE_PATH = "/api/shopify/staging/execute/jobs";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/shopify/link-intelligence/audit") {
      return handleLinkAudit(env);
    }

    if (request.method === "POST" && url.pathname === "/api/shopify/link-intelligence/repair/prepare") {
      return guarded("link_repair_prepare_failed", async () => ({
        plan: await prepareHomepageLinkRepair(request, env),
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/shopify/link-intelligence/repair/execute") {
      return guarded("link_repair_execute_failed", async () => ({
        result: await executeHomepageLinkRepair(request, env, await safeJSON(request.clone())),
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/shopify/link-intelligence/review/prepare") {
      return guarded("lifecycle_review_prepare_failed", async () => ({
        review: await prepareLifecycleReview(request, env),
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/shopify/link-intelligence/review/decide") {
      return guarded("lifecycle_review_decision_failed", async () => ({
        review: await decideLifecycleReview(request, await safeJSON(request.clone())),
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/shopify/link-intelligence/review/execute") {
      return guarded("lifecycle_review_execute_failed", async () => ({
        result: await executeApprovedLifecycleReview(request, env, await safeJSON(request.clone())),
      }));
    }

    if (request.method === "GET" && url.pathname === "/api/shopify/website-retool/schema-inspection") {
      return guarded("website_retool_schema_inspection_failed", async () => ({
        report: await inspectWebsiteRetoolSchema(request, env),
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/shopify/website-retool/exceptions/prepare") {
      return guarded("website_retool_exception_plan_failed", async () => ({
        plan: await prepareWebsiteRetoolExceptions(request, env),
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/shopify/website-retool/exceptions/execute") {
      return guarded("website_retool_exception_execution_failed", async () => ({
        result: await executeWebsiteRetoolExceptions(request, env, await safeJSON(request.clone())),
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/shopify/website-retool/exceptions/rollback") {
      return guarded("website_retool_exception_rollback_failed", async () => ({
        result: await rollbackWebsiteRetoolExceptions(request, env, await safeJSON(request.clone())),
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/shopify/website-intelligence/run") {
      return guarded("website_intelligence_run_failed", async () => ({
        report: await runWebsiteIntelligenceSupervisor(request, env, "manual"),
      }), 502);
    }

    if (request.method === "GET" && url.pathname === "/api/shopify/website-intelligence/latest") {
      const report = await readLatestWebsiteIntelligenceReport(request);
      return report
        ? json({ status: "completed", build: BUILD, report })
        : json({ status: "not-ready", build: BUILD, message: "No website review has been completed yet." }, 404);
    }

    if (request.method === "POST" && url.pathname === STAGING_PLAN_PATH) {
      return handleStagingPlan(request, env, ctx);
    }

    if (request.method === "POST" && url.pathname === STAGING_EXECUTE_PATH) {
      const payload = await safeJSON(request.clone());
      const mode = String(payload?.plan?.plan?.installationMode || "");
      if (mode.startsWith(CANONICAL_PREFIX)) {
        return blocked(
          "visual_replacement_forbidden",
          "Kairos blocked this execution because it would replace the approved homepage structure or styling. Create a patch-only plan that edits existing settings."
        );
      }
    }

    return stamp(await baseRuntime.fetch(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    const request = new Request("https://kairos.internal/api/shopify/website-intelligence/run", { method: "POST" });
    ctx.waitUntil(
      runWebsiteIntelligenceSupervisor(request, env, `scheduled:${controller.cron}`).catch(() => null),
    );
  },
};

async function handleLinkAudit(env) {
  try {
    const origin = String(env.MMG_STOREFRONT_ORIGIN || "").trim();
    if (!origin) throw new Error("MMG storefront origin is not configured.");
    const report = await auditHomepageLinks(origin);
    return json({ status: "completed", build: BUILD, report });
  } catch (error) {
    return failure("link_audit_failed", error, 502);
  }
}

async function handleStagingPlan(request, env, ctx) {
  const bodyText = await request.text();
  const payload = parseJSON(bodyText);
  await appendLinkIntelligence(payload, env);
  const forwardedBody = JSON.stringify(payload);

  const first = await enforcePatchOnlyPlan(cloneRequest(request, forwardedBody), env, ctx);
  if (first.status !== 409) return stamp(first);

  const failureBody = await safeJSON(first.clone());
  if (failureBody?.error?.code !== "patch_only_source_required") return stamp(first);

  try {
    const restored = await restoreApprovedHomepageBaseline(env);
    const retry = await enforcePatchOnlyPlan(cloneRequest(request, forwardedBody), env, ctx);
    const headers = new Headers(retry.headers);
    headers.set("X-Kairos-Baseline-Restored", "verified");
    headers.set("X-Kairos-Baseline-Source", restored.sourceTheme?.name || "MAIN");
    return stamp(new Response(retry.body, {
      status: retry.status,
      statusText: retry.statusText,
      headers,
    }));
  } catch (error) {
    return failure("approved_baseline_restore_failed", error, 409, {
      stagingOnly: true,
      patchOnly: true,
      liveThemeChanged: false,
    });
  }
}

async function enforcePatchOnlyPlan(request, env, ctx) {
  const submitted = await baseRuntime.fetch(request, env, ctx);
  if (!submitted.ok && submitted.status !== 202) return submitted;

  const envelope = await safeJSON(submitted.clone());
  const pollURL = String(envelope?.pollURL || "");
  if (!pollURL) return submitted;

  const completedResponse = await baseRuntime.fetch(new Request(new URL(pollURL, request.url), {
    method: "GET",
    headers: request.headers,
  }), env, ctx);
  const completed = await safeJSON(completedResponse.clone());
  const mode = String(completed?.result?.plan?.installationMode || "");

  if (mode.startsWith(CANONICAL_PREFIX)) {
    return blocked(
      "patch_only_source_required",
      "The current staging source does not expose a safe existing-settings patch. Kairos will not install a replacement homepage. Restore the approved homepage baseline on Kairos Staging, then generate a new patch-only plan."
    );
  }

  return submitted;
}

async function appendLinkIntelligence(payload, env) {
  try {
    const origin = String(env.MMG_STOREFRONT_ORIGIN || "").trim();
    if (!origin) return;
    const report = await auditHomepageLinks(origin);
    const actionable = report.results
      .filter(item => item.lifecycleDecision !== "keep")
      .slice(0, 20)
      .map(item => ({
        label: item.label,
        currentURL: item.url,
        status: item.status,
        statusCode: item.statusCode,
        lifecycleDecision: item.lifecycleDecision,
        expectedStage: item.expectedStage,
        recommendedURL: item.recommendedURL,
        confidence: item.confidence,
        rationale: item.rationale,
      }));
    payload.objective = `${String(payload.objective || "").trim()}\n\nKAIROS LINK LIFECYCLE INTELLIGENCE:\n${JSON.stringify({ summary: report.summary, actionable }, null, 2)}\n\nRULES: Repair broken links automatically only when confidence is at least 0.9 and the destination is verified. For lower-confidence lifecycle mismatches, include the correction in the proposal for executive approval. Never invent a route. Preserve the rendered design; change only existing URL values.`;
  } catch (error) {
    payload.objective = `${String(payload.objective || "").trim()}\n\nLINK AUDIT WARNING: ${error instanceof Error ? error.message : "Audit unavailable"}. Do not guess or invent replacements.`;
  }
}

async function guarded(code, run, status = 409) {
  try {
    return json({ status: "completed", build: BUILD, ...(await run()) });
  } catch (error) {
    return failure(code, error, status);
  }
}

function blocked(code, message) {
  return json({
    status: "blocked",
    build: BUILD,
    error: { code, message },
    safeguards: {
      patchOnly: true,
      canonicalHomepageInstaller: "blocked",
      visualStructureMutation: "blocked",
      liveThemeMutation: "blocked",
    },
  }, 409, {
    "X-Kairos-Visual-Lock": "patch-only",
  });
}

function failure(code, error, status = 409, safeguards = {}) {
  return json({
    status: status >= 500 ? "failed" : "needs-attention",
    build: BUILD,
    error: {
      code,
      message: error instanceof Error ? error.message : "Kairos could not complete this operation.",
    },
    safeguards: {
      liveThemeChanged: false,
      sourceHashBound: true,
      ...safeguards,
    },
  }, status);
}

function cloneRequest(request, body) {
  return new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body,
    redirect: request.redirect,
  });
}

function parseJSON(text) {
  try { return text ? JSON.parse(text) : {}; }
  catch { return {}; }
}

async function safeJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Production-Baseline", "reconciled-v1");
  headers.set("X-Kairos-Visual-Lock", "patch-only");
  if (headers.get("Content-Type")?.includes("text/html")) {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(value, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Production-Baseline": "reconciled-v1",
      "X-Content-Type-Options": "nosniff",
      ...additionalHeaders,
    },
  });
}
