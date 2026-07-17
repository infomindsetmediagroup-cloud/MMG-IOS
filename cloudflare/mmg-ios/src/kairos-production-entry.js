import baseRuntime, { KairosProject } from "./kairos-production-entry-v2.js";
import { handleChildActionRequest } from "./kairos-child-action-runtime-v1.js";
import { handleAutonomyRequest, runAutonomyCycle } from "./kairos-autonomy-runtime-v1.js";
import {
  handleOperationalRequest,
  mirrorOperationalResponse,
  KAIROS_OPERATIONAL_RUNTIME_BUILD,
} from "./kairos-operational-runtime-v1.js";
import { inferenceRuntime } from "./kairos-intelligence-v1.js";
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
import {
  buildExecutiveBriefing,
  decideExecutiveBriefingItem,
  readLatestExecutiveBriefing,
} from "./kairos-executive-briefing-v1.js";
import { handleHomepageReleaseRequest } from "./shopify-homepage-release-v1.js";

const BUILD = "kairos-production-baseline-20260717-7";
const STAGING_PLAN_PATH = "/api/shopify/staging/plan/jobs";
const CHILD_EXECUTE_PATH = "/api/hub/execute";
const AUTONOMY_PREFIX = "/api/autonomy/";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(AUTONOMY_PREFIX)) {
      try {
        const response = await handleAutonomyRequest(
          request,
          env,
          delegatedRequest => handleStableRequest(delegatedRequest, env, ctx),
        );
        if (response) return stamp(response, {
          "X-Kairos-Autonomy": "bounded-native-controls",
          "X-Kairos-Autonomy-Runtime": "kairos-autonomy-runtime-20260716-3",
        });
      } catch (error) {
        return failure("autonomy_control_failed", error, 502, {
          browserShellAvailable: true,
          failureContainedToAutonomyRequest: true,
          approvalGatesPreserved: true,
          liveThemeChanged: false,
        });
      }
    }

    if (request.method === "POST" && url.pathname === CHILD_EXECUTE_PATH) {
      try {
        const response = await handleChildActionRequest(
          request,
          env,
          ctx,
          delegatedRequest => handleStableRequest(delegatedRequest, env, ctx),
        );
        if (response) return stamp(response, {
          "X-Kairos-Child-Action": "direct-objective-to-deliverable",
          "X-Kairos-Child-Action-Runtime": "kairos-child-action-runtime-20260716-1",
        });
      } catch (error) {
        return failure("child_action_execution_failed", error, 502, {
          browserShellAvailable: true,
          failureContainedToChildRequest: true,
          liveThemeChanged: false,
        });
      }
    }

    try {
      const operational = await handleOperationalRequest(
        request,
        env,
        ctx,
        delegatedRequest => handleStableRequest(delegatedRequest, env, ctx),
      );
      if (operational) return stamp(operational, {
        "X-Kairos-Operational-Runtime": KAIROS_OPERATIONAL_RUNTIME_BUILD,
        "X-Kairos-Operational-Persistence": env?.KAIROS_PROJECTS ? "durable-object" : "unavailable",
      });
    } catch (error) {
      return failure("operational_runtime_failed", error, 502, {
        browserShellAvailable: true,
        failureContainedToOperationalRequest: true,
        durableStatePreserved: true,
        liveThemeChanged: false,
      });
    }

    let response = await handleStableRequest(request, env, ctx);
    if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) {
      response = await addOperationalHealth(response, env);
    }
    try { await mirrorOperationalResponse(request, response, env); } catch {}
    return stamp(response);
  },

  async scheduled(controller, env, ctx) {
    const source = `scheduled:${String(controller?.cron || "cloudflare-cron")}`;
    const request = new Request("https://kairos.internal/api/shopify/website-intelligence/run", { method: "POST" });
    const work = Promise.allSettled([
      runWebsiteIntelligenceSupervisor(request, env, source),
      buildExecutiveBriefing(request, env, source),
      runAutonomyCycle(env, {
        source,
        delegate: delegatedRequest => handleStableRequest(delegatedRequest, env, ctx),
      }),
    ]);
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
    else await work;
  },
};

async function handleStableRequest(request, env, ctx) {
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

  if (request.method === "POST" && url.pathname === "/api/executive-briefing/build") {
    return guarded("executive_briefing_build_failed", async () => ({
      briefing: await buildExecutiveBriefing(request, env, "manual"),
    }), 502);
  }

  if (request.method === "GET" && url.pathname === "/api/executive-briefing/latest") {
    const briefing = await readLatestExecutiveBriefing(request);
    return briefing
      ? json({ status: "completed", build: BUILD, briefing })
      : json({ status: "not-ready", build: BUILD, message: "No executive briefing has been prepared yet." }, 404);
  }

  if (request.method === "POST" && url.pathname === "/api/executive-briefing/decide") {
    return guarded("executive_briefing_decision_failed", async () => ({
      briefing: await decideExecutiveBriefingItem(request, await safeJSON(request.clone())),
    }));
  }

  if (url.pathname.startsWith("/api/shopify/homepage-release/")) {
    const response = await handleHomepageReleaseRequest(request, env);
    if (response) return stamp(response);
  }

  if (request.method === "POST" && url.pathname === STAGING_PLAN_PATH) {
    return handleStagingPlan(request, env, ctx);
  }

  return stamp(await baseRuntime.fetch(request, env, ctx));
}

async function addOperationalHealth(response, env) {
  let body;
  try { body = await response.clone().json(); }
  catch { return response; }
  const enhancedInference = inferenceRuntime(env);
  body.build = BUILD;
  body.operationalRuntime = {
    status: env?.KAIROS_PROJECTS ? "operational" : "needs-configuration",
    build: KAIROS_OPERATIONAL_RUNTIME_BUILD,
    orchestration: "durable-domain-routed",
    persistence: env?.KAIROS_PROJECTS ? "durable-object" : "unavailable",
    executionReceiptMirroring: "operational",
    childActionContracts: "operational",
    enhancedInference: enhancedInference.configured ? enhancedInference.mode : "needs-configuration",
    deterministicNativeFallback: "operational",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    durableOperationalLedger: env?.KAIROS_PROJECTS ? "operational" : "needs-configuration",
    durableWorkItems: env?.KAIROS_PROJECTS ? "operational" : "needs-configuration",
    durableWorkflowRecords: env?.KAIROS_PROJECTS ? "operational" : "needs-configuration",
    executionReceiptMirroring: "operational",
    systemRegistry: "operational",
    childCardActionContracts: "operational",
  };
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Operational-Runtime", KAIROS_OPERATIONAL_RUNTIME_BUILD);
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
  return stamp(await baseRuntime.fetch(cloneRequest(request, JSON.stringify(payload)), env, ctx));
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

function stamp(response, additionalHeaders = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Production-Baseline", "reconciled-v7");
  headers.set("X-Kairos-Website-Workflow", "staging-preview-approval-release");
  for (const [name, value] of Object.entries(additionalHeaders)) headers.set(name, value);
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
      "X-Kairos-Production-Baseline": "reconciled-v7",
      "X-Content-Type-Options": "nosniff",
      ...additionalHeaders,
    },
  });
}
