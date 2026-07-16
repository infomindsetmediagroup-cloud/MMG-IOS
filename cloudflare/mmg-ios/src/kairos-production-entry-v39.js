import runtime, { KairosProject } from "./kairos-production-entry-v38.js";

const BUILD = "kairos-production-entry-20260716-96";
export const KAIROS_WEBSITE_INTENT_GATE_BUILD = "kairos-website-intent-gate-20260716-1";
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
  "redesign",
  "rebuild",
]);
const CONTENT_ONLY_DECLARATIONS = new Set([
  "content-only",
  "copy-only",
  "text-only",
  "literal-replacement",
]);
const STRUCTURAL_PATTERNS = [
  /\b(full|complete|comprehensive|canonical|structural)\s+(website|site|homepage|page|storefront)\s+(retool|redesign|rebuild|build|overhaul|implementation)\b/i,
  /\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure|transform)\b[\s\S]{0,140}\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system|shopify theme)\b/i,
  /\b(website|site|homepage|storefront|customer journey|navigation|header|footer|layout|section|sections|design system|shopify theme)\b[\s\S]{0,140}\b(retool|redesign|rebuild|overhaul|build|implement|develop|restructure|transform)\b/i,
  /\b(apple|nike)[- ]inspired\b[\s\S]{0,140}\b(website|site|homepage|storefront|design|experience|storytelling)\b/i,
  /\b(add|remove|move|reorder|create|replace|rebuild)\b[\s\S]{0,90}\b(section|sections|component|components|navigation|header|footer|layout|template|card|cards|carousel|hero)\b/i,
  /\b(mobile-first|responsive|desktop and mobile|visual hierarchy|editorial presentation|guided customer experience)\b/i,
  /\btemplates\/index\.json\b|\bshopify liquid\b|\bliquid,?\s+json,?\s+css\b|\bhomepage javascript asset\b/i,
  /\borient\s*(?:→|->|>)\s*discover\s*(?:→|->|>)\s*understand\b/i,
];

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let classification = null;
    let routedRequest = request;

    if (request.method === "POST" && url.pathname === PLAN_ROUTE) {
      try {
        const routed = await canonicalizeWebsitePlanRequest(request);
        classification = routed.classification;
        routedRequest = routed.request;
      } catch (error) {
        return jsonError(
          400,
          "website_intent_gate_invalid_request",
          error instanceof Error ? error.message : "Kairos could not classify the website objective.",
        );
      }
    }

    let response = await runtime.fetch(routedRequest, env, ctx);
    if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) {
      response = await addWebsiteIntentHealth(response);
    }
    return stamp(response, classification);
  },

  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

async function canonicalizeWebsitePlanRequest(request) {
  let payload = {};
  try { payload = await request.clone().json(); }
  catch { throw new Error("The website objective request must contain valid JSON."); }

  const classification = classifyWebsiteIntent(payload);
  const canonical = classification.intent === "full-retool"
    ? {
        ...payload,
        requestType: "full-retool",
        intent: "full-retool",
        mode: "full-retool",
        fullRetoolConfirmed: true,
        structuralMutationAuthorized: true,
        styleMutationAuthorized: true,
        contentOnlyLocked: false,
        literalOnly: false,
        structuralObjectiveDetected: true,
        routingAuthority: KAIROS_WEBSITE_INTENT_GATE_BUILD,
      }
    : {
        ...payload,
        requestType: "content-only",
        intent: "content-only",
        mode: "content-only",
        fullRetoolConfirmed: false,
        structuralMutationAuthorized: false,
        styleMutationAuthorized: false,
        contentOnlyLocked: true,
        structuralObjectiveDetected: false,
        routingAuthority: KAIROS_WEBSITE_INTENT_GATE_BUILD,
      };

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Kairos-Website-Intent", classification.intent);
  headers.set("X-Kairos-Intent-Reason", classification.reason);
  headers.set("X-Kairos-Content-Only-Lock", classification.intent === "content-only" ? "true" : "false");
  headers.set("X-Kairos-Structural-Objective", classification.structural ? "true" : "false");
  headers.set("X-Kairos-Website-Intent-Gate", KAIROS_WEBSITE_INTENT_GATE_BUILD);

  return {
    classification,
    request: new Request(request, {
      headers,
      body: JSON.stringify(canonical),
    }),
  };
}

function classifyWebsiteIntent(payload) {
  const declared = String(payload?.requestType || payload?.intent || payload?.mode || "").trim().toLowerCase();
  const objective = String(payload?.objective || payload?.prompt || payload?.instruction || "").trim();
  const explicitFull = FULL_RETOOL_DECLARATIONS.has(declared)
    || payload?.fullRetoolConfirmed === true
    || payload?.structuralMutationAuthorized === true
    || payload?.styleMutationAuthorized === true;
  const structural = explicitFull || STRUCTURAL_PATTERNS.some(pattern => pattern.test(objective));
  const literalReplacement = hasLiteralReplacementBlocks(objective);
  const explicitContentOnly = CONTENT_ONLY_DECLARATIONS.has(declared)
    || payload?.contentOnlyLocked === true
    || payload?.literalOnly === true;

  // Structural intent always outranks a stale UI content-only default. This is the
  // invariant that prevents homepage builds from falling into phrase replacement.
  if (structural) {
    return {
      intent: "full-retool",
      reason: explicitFull ? "explicit-structural-authorization" : "structural-objective-overrides-content-only-default",
      structural: true,
      literalReplacement,
    };
  }

  if (literalReplacement) {
    return {
      intent: "content-only",
      reason: "explicit-literal-replacement-blocks",
      structural: false,
      literalReplacement: true,
    };
  }

  if (explicitContentOnly || containsExplicitContentOnlyLanguage(objective)) {
    return {
      intent: "content-only",
      reason: "explicit-content-only-request",
      structural: false,
      literalReplacement: false,
    };
  }

  return {
    intent: "content-only",
    reason: "no-structural-operation-detected",
    structural: false,
    literalReplacement: false,
  };
}

function hasLiteralReplacementBlocks(objective) {
  const value = String(objective || "");
  return (
    /\breplace\s+source\s*:/i.test(value) && /\bwith\s+(?:the\s+)?replacement\s*:/i.test(value)
  ) || (
    /\bsource\s*:\s*[\s\S]{1,1200}\breplacement\s*:/i.test(value)
  );
}

function containsExplicitContentOnlyLanguage(objective) {
  return /\b(content[- ]only|copy[- ]only|text[- ]only|wording only|literal replacement)\b/i.test(String(objective || ""));
}

async function addWebsiteIntentHealth(response) {
  let body;
  try { body = await response.clone().json(); }
  catch { return response; }

  body.build = BUILD;
  body.websiteIntentRouting = {
    status: "operational",
    build: KAIROS_WEBSITE_INTENT_GATE_BUILD,
    structuralPrecedence: "enforced",
    staleContentOnlyDefault: "overridden",
    requestCanonicalization: "full-retool-before-delegation",
    literalContentOnly: "explicit-blocks-or-explicit-request-only",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    structuralHomepageAutoRouting: "operational",
    contentOnlyStructuralFallback: "prohibited",
    websitePlanRequestCanonicalization: "operational",
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
  headers.set("X-Kairos-Website-Intent-Gate", KAIROS_WEBSITE_INTENT_GATE_BUILD);
  if (classification) {
    headers.set("X-Kairos-Website-Intent", classification.intent);
    headers.set("X-Kairos-Intent-Reason", classification.reason);
    headers.set("X-Kairos-Content-Only-Lock", classification.intent === "content-only" ? "true" : "false");
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
    status: "needs-attention",
    build: BUILD,
    error: { code, message },
  }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Production-Entry": BUILD,
      "X-Kairos-Website-Intent-Gate": KAIROS_WEBSITE_INTENT_GATE_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
