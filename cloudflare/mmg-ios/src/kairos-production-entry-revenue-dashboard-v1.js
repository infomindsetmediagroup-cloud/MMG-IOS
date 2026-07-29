import currentRuntime, { KairosProject as CurrentKairosProject } from "./kairos-production-entry-local-inference-v1.js";
import {
  handleKairosRevenueProductAPI,
  handleKairosRevenueProductObjectRequest,
  KAIROS_REVENUE_PRODUCT_STORE_BUILD,
} from "./kairos-revenue-product-store-v1.js";
import {
  handleFirstRevenueRunObjectRequest,
  handleProductionRevenueRuntime,
  KAIROS_PRODUCTION_REVENUE_RUNTIME_COMPOSITION_BUILD,
} from "./kairos-production-revenue-runtime-composition-v1.js";
import {
  handleKairosRuntimeProjectObjectRequest,
  KAIROS_RUNTIME_PROJECT_STORE_BUILD,
} from "./kairos-runtime-project-store-v1.js";
import {
  handleKairosRuntimeHealth,
  KAIROS_RUNTIME_HEALTH_BUILD,
} from "./kairos-runtime-health-v1.js";
import { readShopifyDashboardAnalyticsV3 } from "./shopify-live-analytics-v3.js";
import {
  buildExecutiveBriefing,
  readLatestExecutiveBriefing,
  decideExecutiveBriefingItem,
} from "./kairos-executive-briefing-v1.js";

export {
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
} from "./kairos-production-entry-local-inference-v1.js";

export const KAIROS_REVENUE_DASHBOARD_ENTRY_BUILD = "kairos-revenue-dashboard-entry-20260729-7";
export const KAIROS_BROWSER_RUNTIME_BRIDGE_BUILD = "kairos-browser-runtime-bridge-20260729-1";

const RUNTIME_PROJECT_PATH = "/registry/kairos-runtime-projects";
const HUB_ACTIONS = new Set(["objective", "growth-plan", "revenue-intelligence"]);

export class KairosProject extends CurrentKairosProject {
  async fetch(request) {
    const firstRunResponse = await handleFirstRevenueRunObjectRequest(this.state, request.clone());
    if (firstRunResponse) return stampRevenueBoundary(firstRunResponse);

    const revenueResponse = await handleKairosRevenueProductObjectRequest(this.state, request.clone());
    if (revenueResponse) return stampRevenueBoundary(revenueResponse);

    const runtimeProjectResponse = await handleKairosRuntimeProjectObjectRequest(this.state, request.clone());
    if (runtimeProjectResponse) return stampRevenueBoundary(runtimeProjectResponse);

    return super.fetch(request);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return serveDashboardAsset(request, env);
    }

    const browserRuntimeResponse = await handleBrowserRuntimeRoute(request, env);
    if (browserRuntimeResponse) return stampRevenueBoundary(browserRuntimeResponse);

    const briefingResponse = await handleExecutiveBriefingRoute(request, env);
    if (briefingResponse) return stampRevenueBoundary(briefingResponse);

    if (url.pathname === "/api/analytics/shopify" && request.method === "GET") {
      try {
        const analytics = await readShopifyDashboardAnalyticsV3(env);
        return json({ status: analytics.status, analytics });
      } catch (error) {
        return json({
          status: "needs-attention",
          analytics: { status: "unavailable", metrics: [] },
          error: {
            code: error?.code || "shopify_analytics_unavailable",
            message: error instanceof Error ? error.message : "Shopify analytics are unavailable.",
          },
        }, Number(error?.status || 503));
      }
    }

    const revenueResponse = await handleKairosRevenueProductAPI(request.clone(), env);
    if (revenueResponse) return stampRevenueBoundary(revenueResponse);

    return handleProductionRevenueRuntime(request, env, (nextRequest) => currentRuntime.fetch(nextRequest, env, ctx));
  },
  async scheduled(controller, env, ctx) {
    if (typeof currentRuntime.scheduled === "function") {
      return currentRuntime.scheduled(controller, env, ctx);
    }
    return undefined;
  },
};

async function handleBrowserRuntimeRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === "/api/health") {
    if (method !== "GET") return methodNotAllowed("GET");
    return browserHealth(request, env);
  }

  if (path === "/api/workflows") {
    if (method !== "GET") return methodNotAllowed("GET");
    return browserWorkflows(env);
  }

  if (path === "/api/hub/run") {
    if (method !== "POST") return methodNotAllowed("POST");
    return startBrowserObjective(request, env);
  }

  return null;
}

async function browserHealth(request, env) {
  try {
    const canonicalURL = new URL(request.url);
    canonicalURL.pathname = "/api/kairos/runtime/health";
    canonicalURL.search = "";
    const canonicalRequest = new Request(canonicalURL.toString(), {
      method: "GET",
      headers: request.headers,
    });
    const canonicalResponse = handleKairosRuntimeHealth(canonicalRequest, env);
    const health = canonicalResponse ? await canonicalResponse.json() : {};
    const providerStatus = String(health?.provider?.status || "unknown").toLowerCase();
    const coreReady = health?.application === "ready"
      && health?.storage === "ready"
      && health?.workflow === "ready";
    const providerReady = !["blocked", "disabled"].includes(providerStatus);
    return json({
      ...health,
      status: coreReady && providerReady ? "ready" : "degraded",
      browserBridge: KAIROS_BROWSER_RUNTIME_BRIDGE_BUILD,
      canonicalHealth: KAIROS_RUNTIME_HEALTH_BUILD,
    });
  } catch (error) {
    return json({
      status: "degraded",
      application: "ready",
      storage: env?.KAIROS_PROJECTS ? "ready" : "unavailable",
      workflow: env?.KAIROS_PROJECT_WORKFLOW && env?.KAIROS_MANUSCRIPT_WORKFLOW ? "ready" : "degraded",
      provider: {
        provider: String(env?.KAIROS_MODEL_PROVIDER || "unknown"),
        status: String(env?.OPENAI_API_KEY || "") ? "unknown" : "blocked",
        model: String(env?.KAIROS_MODEL_NAME || env?.KAIROS_OPENAI_MODEL || "") || null,
        reason: error instanceof Error ? error.message : "Canonical runtime health could not be normalized.",
      },
      browserBridge: KAIROS_BROWSER_RUNTIME_BRIDGE_BUILD,
    });
  }
}

async function browserWorkflows(env) {
  try {
    const response = await runtimeProjectRequest(env, { operation: "list" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw runtimeError(
        payload?.error?.code || "RUNTIME_PROJECT_LIST_FAILED",
        payload?.error?.message || "Kairos runtime projects could not be listed.",
        response.status,
      );
    }
    const projects = Array.isArray(payload?.projects) ? payload.projects : [];
    return json({
      status: "ready",
      workflows: projects.map(mapRuntimeProject),
      count: projects.length,
      source: "kairos-runtime-projects",
      browserBridge: KAIROS_BROWSER_RUNTIME_BRIDGE_BUILD,
    });
  } catch (error) {
    return json({
      status: "degraded",
      workflows: [],
      count: 0,
      source: "kairos-runtime-projects",
      warning: {
        code: error?.code || "WORKFLOW_PROJECTION_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Kairos workflow projection is temporarily unavailable.",
      },
      browserBridge: KAIROS_BROWSER_RUNTIME_BRIDGE_BUILD,
    });
  }
}

async function startBrowserObjective(request, env) {
  try {
    const payload = await request.json().catch(() => ({}));
    const action = clean(payload?.action || "objective", 80).toLowerCase();
    const objective = clean(payload?.objective, 12000);
    if (!HUB_ACTIONS.has(action)) {
      return json({
        error: {
          code: "HUB_ACTION_INVALID",
          message: "Kairos accepts objective, growth-plan, or revenue-intelligence work from this browser.",
        },
      }, 400);
    }
    if (objective.length < 3) {
      return json({
        error: {
          code: "OBJECTIVE_REQUIRED",
          message: "State the business outcome before Kairos begins.",
        },
      }, 400);
    }

    const operatorIdentityHash = browserIdentityHash(request);
    const input = {
      projectId: `kproject_browser_${crypto.randomUUID()}`,
      department: action === "growth-plan" ? "growth" : action === "revenue-intelligence" ? "revenue" : "publishing",
      projectType: action === "objective" ? "digital_asset_project" : action,
      title: hubTitle(action, objective),
      state: "intake",
      progress: {
        percent: 5,
        stage: "intake",
        completedUnits: 0,
        totalUnits: 0,
      },
      objective: {
        summary: objective,
        classification: action,
        deliverableTypes: action === "objective" ? ["digital_asset_package"] : ["operating_plan"],
        requiredAssetTypes: [],
        complexity: "unclassified",
        approved: false,
      },
      approvals: [{
        gate: "production_plan",
        required: true,
        status: "pending",
        identityHash: operatorIdentityHash,
      }],
      operatorIdentityHash,
      environment: clean(env?.KAIROS_ENVIRONMENT || "production", 80),
      commitSha: clean(env?.KAIROS_COMMIT_SHA, 80) || null,
    };

    const response = await runtimeProjectRequest(env, { operation: "create", input });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw runtimeError(
        body?.error?.code || "OBJECTIVE_START_FAILED",
        body?.error?.message || "Kairos could not start the governed work.",
        response.status,
      );
    }

    const workflow = mapRuntimeProject(body.project || input);
    return json({
      status: "accepted",
      workflow,
      project: body.project || null,
      nextAction: workflow.nextAction,
      automaticPublicationAllowed: false,
      browserBridge: KAIROS_BROWSER_RUNTIME_BRIDGE_BUILD,
    }, 202);
  } catch (error) {
    return json({
      error: {
        code: error?.code || "OBJECTIVE_START_FAILED",
        message: error instanceof Error ? error.message : "Kairos could not start the governed work.",
      },
      automaticPublicationAllowed: false,
      browserBridge: KAIROS_BROWSER_RUNTIME_BRIDGE_BUILD,
    }, Number(error?.status || 503));
  }
}

async function runtimeProjectRequest(env, payload) {
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) {
    throw runtimeError("RUNTIME_STORAGE_UNAVAILABLE", "Kairos runtime project storage is unavailable.", 503);
  }
  const id = env.KAIROS_PROJECTS.idFromName("mmg-production-project-registry");
  const stub = env.KAIROS_PROJECTS.get(id);
  return stub.fetch(new Request(`https://kairos.internal${RUNTIME_PROJECT_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

function mapRuntimeProject(project = {}) {
  const rawState = clean(project.state || "initialized", 40);
  const progress = project.progress && typeof project.progress === "object" ? project.progress : {};
  const events = Array.isArray(project.events) ? project.events : [];
  const assets = Array.isArray(project.assets) ? project.assets : [];
  const deliverables = Array.isArray(project.deliverables) ? project.deliverables : [];

  return {
    id: clean(project.projectId || project.id, 180),
    workflowId: clean(project.projectId || project.id, 180),
    title: clean(project.title || project.objective?.summary || "Kairos governed work", 240),
    summary: clean(project.blockedReason || project.objective?.summary || deriveNextAction(rawState), 2000),
    objective: clean(project.objective?.summary, 2000),
    department: clean(project.department || "publishing", 80),
    workflowType: clean(project.projectType || "publishing_project", 120),
    state: browserState(rawState),
    rawState,
    completedTasks: number(progress.completedUnits),
    taskCount: number(progress.totalUnits),
    completedSteps: number(progress.completedUnits),
    totalSteps: number(progress.totalUnits),
    progressPercent: number(progress.percent),
    blockedReason: clean(project.blockedReason, 1000) || null,
    nextAction: deriveNextAction(rawState),
    tasks: events.map(mapRuntimeEvent),
    assets: assets.map(mapRuntimeAsset),
    deliverables: deliverables.map(mapRuntimeDeliverable),
    receipts: [],
    evidence: [],
    createdAt: project.createdAt || null,
    updatedAt: project.updatedAt || project.createdAt || null,
  };
}

function mapRuntimeEvent(event = {}, index) {
  const type = clean(event.type || `step_${index + 1}`, 80);
  return {
    id: clean(event.eventId || `event_${index + 1}`, 180),
    title: eventTitle(type),
    summary: clean(event.summary, 1200),
    state: eventState(type),
    status: eventState(type),
    completed: eventState(type) === "completed",
    occurredAt: event.occurredAt || null,
  };
}

function mapRuntimeAsset(asset = {}) {
  const sourceReference = clean(asset.sourceReference, 500);
  return {
    id: clean(asset.assetId, 180),
    title: clean(asset.type || "Production asset", 120),
    name: clean(asset.type || "Production asset", 120),
    type: clean(asset.type || "asset", 120),
    status: clean(asset.status || "recorded", 40),
    version: number(asset.version) || 1,
    checksum: clean(asset.checksum, 180) || null,
    path: sourceReference || null,
    url: safeReference(sourceReference),
  };
}

function mapRuntimeDeliverable(deliverable = {}) {
  return {
    id: clean(deliverable.deliverableId, 180),
    title: clean(deliverable.type || "Deliverable", 120),
    name: clean(deliverable.type || "Deliverable", 120),
    type: clean(deliverable.type || "deliverable", 120),
    status: clean(deliverable.status || "planned", 40),
    version: number(deliverable.version) || 1,
    approved: deliverable.approved === true,
    assetIds: Array.isArray(deliverable.assetIds) ? deliverable.assetIds : [],
  };
}

function browserState(state) {
  if (state === "archived") return "completed";
  if (state === "blocked") return "blocked";
  if (state === "failed") return "failed";
  if (state === "cancelled") return "cancelled";
  if (state === "awaiting_approval") return "pending";
  if (state === "queued") return "queued";
  return "active";
}

function deriveNextAction(state) {
  const actions = {
    initialized: "Continue project intake.",
    intake: "Collect and validate the required production inputs.",
    objective_analysis: "Complete objective analysis and required-asset checks.",
    planning: "Prepare the governed production plan.",
    awaiting_approval: "Review and approve the production plan.",
    queued: "Start the approved production run.",
    executing: "Complete the current production stage.",
    quality_review: "Review the generated assets and record QA.",
    packaging: "Assemble and verify the customer delivery package.",
    delivery: "Approve and release the customer deliverables.",
    follow_up: "Complete follow-up and archive the project.",
    archived: "Review the completed deliverables and evidence.",
    blocked: "Resolve the recorded blocker before work continues.",
    failed: "Review the failure and explicitly authorize a retry.",
    cancelled: "This project is closed.",
  };
  return actions[state] || "Review the current workflow state.";
}

function eventTitle(type) {
  return type.split("_").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "").join(" ");
}

function eventState(type) {
  if (/(blocked|failed|rejected|cancelled)/.test(type)) return "blocked";
  if (/(completed|passed|approved|delivered|archived|created|received|submitted|analyzed|started|queued)/.test(type)) return "completed";
  return "pending";
}

function safeReference(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("./")) return value;
  return null;
}

function hubTitle(action, objective) {
  if (action === "growth-plan") return "MMG growth-plan production";
  if (action === "revenue-intelligence") return "MMG revenue intelligence review";
  return objective.length > 96 ? `${objective.slice(0, 93)}…` : objective;
}

function browserIdentityHash(request) {
  const identity = clean(
    request.headers.get("cf-access-authenticated-user-email")
      || request.headers.get("x-kairos-operator")
      || "kairos-dashboard-operator",
    320,
  ).toLowerCase();
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `kid_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function handleExecutiveBriefingRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (!path.startsWith("/api/executive-briefing/")) return null;

  try {
    if (path === "/api/executive-briefing/latest" && method === "GET") {
      const briefing = await readLatestExecutiveBriefing(request);
      return briefing ? json({ briefing }) : json({ briefing: null }, 404);
    }

    if (path === "/api/executive-briefing/build" && method === "POST") {
      const briefing = await buildExecutiveBriefing(request, env, "manual");
      return json({ briefing });
    }

    if (path === "/api/executive-briefing/decide" && method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const briefing = await decideExecutiveBriefingItem(request, payload);
      return json({ briefing });
    }

    return null;
  } catch (error) {
    return json({
      error: {
        code: "executive_briefing_unavailable",
        message: error instanceof Error ? error.message : "Kairos could not prepare the approval brief.",
      },
    }, 503);
  }
}

async function serveDashboardAsset(request, env) {
  if (!env?.ASSETS?.fetch) {
    return new Response("Kairos dashboard assets are unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.delete("Content-Disposition");
  headers.set("X-Kairos-Revenue-Dashboard-Entry", KAIROS_REVENUE_DASHBOARD_ENTRY_BUILD);
  headers.set("X-Content-Type-Options", "nosniff");
  if ((headers.get("Content-Type") || "").includes("text/html")) {
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function methodNotAllowed(allowed) {
  return json({
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: `Use ${allowed}.`,
    },
  }, 405);
}

function stampRevenueBoundary(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Revenue-Dashboard-Entry", KAIROS_REVENUE_DASHBOARD_ENTRY_BUILD);
  headers.set("X-Kairos-Revenue-Product-Store", KAIROS_REVENUE_PRODUCT_STORE_BUILD);
  headers.set("X-Kairos-Revenue-Runtime-Composition", KAIROS_PRODUCTION_REVENUE_RUNTIME_COMPOSITION_BUILD);
  headers.set("X-Kairos-Runtime-Project-Store", KAIROS_RUNTIME_PROJECT_STORE_BUILD);
  headers.set("X-Kairos-Browser-Runtime-Bridge", KAIROS_BROWSER_RUNTIME_BRIDGE_BUILD);
  headers.set("X-Kairos-Automatic-Publication", "disabled");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Revenue-Dashboard-Entry": KAIROS_REVENUE_DASHBOARD_ENTRY_BUILD,
      "X-Kairos-Shopify-Analytics": "orders-fallback-v3",
      "X-Kairos-Runtime-Project-Store": KAIROS_RUNTIME_PROJECT_STORE_BUILD,
      "X-Kairos-Browser-Runtime-Bridge": KAIROS_BROWSER_RUNTIME_BRIDGE_BUILD,
      "X-Kairos-Automatic-Publication": "disabled",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

function runtimeError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
