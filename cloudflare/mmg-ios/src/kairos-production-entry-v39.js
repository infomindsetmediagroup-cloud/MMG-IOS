// Production verification trigger: prove structural Website Retool routing against the live Worker.
import runtime, { KairosProject } from "./kairos-production-entry-v38.js";

const BUILD = "kairos-production-entry-20260716-96";
const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const FULL_RETOOL_DECLARATIONS = new Set([
  "full-retool",
  "structural",
  "structural-retool",
  "design-retool",
  "website-build",
  "site-build",
  "homepage-build",
  "page-build",
]);
const STRUCTURAL_PATTERNS = [
  /\b(full|complete|comprehensive|canonical|premium|cinematic)\b[\s\S]{0,90}\b(website|site|homepage|storefront|customer journey)\b[\s\S]{0,90}\b(retool|redesign|rebuild|build|overhaul|implementation|experience)\b/i,
  /\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure|transform)\b[\s\S]{0,120}\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system)\b/i,
  /\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system)\b[\s\S]{0,120}\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure|transform)\b/i,
  /\bapple[- ]inspired\b/i,
  /\bnike[- ]inspired\b/i,
  /\b(structural|layout|visual|styling|responsive|mobile|desktop|animation|motion|component|template|theme)\b[\s\S]{0,50}\b(change|changes|work|update|updates|implementation|retool|redesign|build)\b/i,
  /\b(add|remove|move|reorder|create|replace|rebuild)\b[\s\S]{0,80}\b(section|sections|component|components|navigation|header|footer|layout|template|card|cards|carousel|hero)\b/i,
];

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    let routedRequest = request;
    let classification = null;
    const url = new URL(request.url);

    try {
      if (request.method === "POST" && url.pathname === PLAN_ROUTE) {
        const routed = await enforceWebsiteIntent(request);
        routedRequest = routed.request;
        classification = routed.classification;
      }

      let response = await runtime.fetch(routedRequest, env, ctx);
      if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) {
        response = await addWebsiteRoutingHealth(response);
      }
      return stamp(response, classification);
    } catch (error) {
      return jsonError(
        Number(error?.statusCode || error?.status || 500),
        error?.code || "website_intent_guard_failed",
        error instanceof Error ? error.message : "Kairos website intent routing failed.",
      );
    }
  },

  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

async function enforceWebsiteIntent(request) {
  let payload = {};
  try { payload = await request.clone().json(); } catch {}

  const objective = String(payload?.objective || payload?.prompt || payload?.instruction || "").trim();
  const declared = String(payload?.requestType || payload?.intent || payload?.mode || "").trim().toLowerCase();
  const staleContentOnlyLock = payload?.contentOnlyLocked === true
    || payload?.literalOnly === true
    || request.headers.get("X-Kairos-Content-Only-Lock") === "true";
  const explicitFull = FULL_RETOOL_DECLARATIONS.has(declared)
    || payload?.fullRetoolConfirmed === true
    || payload?.structuralMutationAuthorized === true
    || payload?.styleMutationAuthorized === true;
  const inferredFull = STRUCTURAL_PATTERNS.some(pattern => pattern.test(objective));

  if (!explicitFull && !inferredFull) {
    return {
      request,
      classification: {
        intent: declared || "content-only",
        reason: "no-structural-operation-detected",
        structuralObjectiveDetected: false,
        staleContentOnlyLock,
      },
    };
  }

  const reason = staleContentOnlyLock
    ? "structural-objective-overrode-content-only-lock"
    : explicitFull
      ? "explicit-structural-authorization"
      : "structural-objective-detected";
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Kairos-Website-Intent", "full-retool");
  headers.set("X-Kairos-Intent-Reason", reason);
  headers.set("X-Kairos-Content-Only-Lock", "false");
  headers.set("X-Kairos-Structural-Runtime", "enabled");
  headers.set("X-Kairos-Website-Intent-Guard", BUILD);

  const body = {
    ...payload,
    objective,
    requestType: "full-retool",
    intent: "full-retool",
    fullRetoolConfirmed: true,
    structuralMutationAuthorized: true,
    styleMutationAuthorized: true,
    contentOnlyLocked: false,
    literalOnly: false,
    websiteIntentRouting: {
      build: BUILD,
      structuralObjectiveDetected: true,
      staleContentOnlyLockOverridden: staleContentOnlyLock,
      reason,
    },
  };

  return {
    request: new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(body),
      redirect: request.redirect,
    }),
    classification: {
      intent: "full-retool",
      reason,
      structuralObjectiveDetected: true,
      staleContentOnlyLock,
    },
  };
}

async function addWebsiteRoutingHealth(response) {
  let body;
  try { body = await response.clone().json(); }
  catch { return response; }

  body.build = BUILD;
  body.websiteIntentRouting = {
    status: "operational",
    build: BUILD,
    contract: "structural-objective-overrides-stale-content-only-lock",
    defaultWorkspaceMode: "full-retool",
    staleBrowserStateMigration: "operational",
    contentOnlyScope: "explicit-literal-copy-replacement-only",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    structuralIntentOverridesContentOnlyLock: "operational",
    websiteRetoolDefaultsToStructural: "operational",
    staleContentOnlyStateMigration: "operational",
  };

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function stamp(response, classification) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Production-Entry", BUILD);
  headers.set("X-Kairos-Website-Intent-Guard", BUILD);
  if (classification) {
    headers.set("X-Kairos-Website-Intent", classification.intent);
    headers.set("X-Kairos-Intent-Reason", classification.reason);
    headers.set("X-Kairos-Content-Only-Lock", classification.intent === "full-retool" ? "false" : "true");
    headers.set("X-Kairos-Structural-Runtime", classification.intent === "full-retool" ? "enabled" : "not-selected");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({
    status: status >= 500 ? "failed" : "needs-attention",
    build: BUILD,
    error: { code, message },
  }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Production-Entry": BUILD,
      "X-Kairos-Website-Intent-Guard": BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
