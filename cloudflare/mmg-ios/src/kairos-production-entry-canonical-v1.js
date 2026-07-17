import runtime, { KairosProject } from "./kairos-production-entry.js";
import canonicalShopifyRuntime from "./kairos-canonical-shopify-planner-v3.js";

export const KAIROS_CANONICAL_COMMAND_BUILD = "kairos-canonical-command-wiring-20260717-1";
export const KAIROS_WEBSITE_INSTRUCTION_SET = "kairos-enterprise-website-build-instructions@2026.07.15-v1";
const WEBSITE_SOURCE = "docs/KAIROS_ENTERPRISE_WEBSITE_BUILD_INSTRUCTIONS.md";
const WEBSITE_CONFIRMATION = "EXECUTE CANONICAL STAGING BUILD";
const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const EXECUTE_PATH = "/api/shopify/staging/execute/jobs";
const CONTRACTS_PATH = "/api/hub/contracts";
const CHILD_EXECUTE_PATH = "/api/hub/execute";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && [PLAN_PATH, EXECUTE_PATH].includes(url.pathname)) {
      const payload = await safeJSON(request.clone());
      if (canonicalWebsiteRequest(url.pathname, payload)) {
        const response = await canonicalShopifyRuntime.fetch(request, env, ctx);
        return stamp(response, {
          "X-Kairos-Instruction-Set": KAIROS_WEBSITE_INSTRUCTION_SET,
          "X-Kairos-Canonical-Website-Build": "staging-authorized-live-locked",
        });
      }
    }

    if (request.method === "POST" && url.pathname === CHILD_EXECUTE_PATH) {
      const payload = await safeJSON(request.clone());
      const action = clean(payload?.action, 120).toLowerCase();
      if (action && !["website", "health"].includes(action)) {
        const instructionSet = clean(payload?.instructionSet || `kairos-action:${action}@v1`, 240);
        const instructionSource = clean(payload?.instructionSource || "KAIROS_ACTION_CONTRACTS", 300);
        const objective = clean(payload?.objective, 12000);
        const governedObjective = `${objective || `Inspect and operate ${action} using current authoritative records.`}\n\nGOVERNING INSTRUCTION CONTRACT: ${instructionSet}\nSOURCE: ${instructionSource}\nExecute the objective through the authoritative domain services. Produce a finished, usable deliverable; verify source-of-truth read-back; preserve evidence and limitations; do not stop at planning when execution is authorized.`;
        const next = cloneJSONRequest(request, { ...payload, objective: governedObjective, instructionSet, instructionSource, canonicalInstructionsRequired: true });
        const response = await runtime.fetch(next, env, ctx);
        return stamp(response, {
          "X-Kairos-Instruction-Set": instructionSet,
          "X-Kairos-Canonical-Child-Execution": "bound",
        });
      }
    }

    let response = await runtime.fetch(request, env, ctx);

    if (request.method === "GET" && url.pathname === CONTRACTS_PATH) response = await augmentContracts(response);
    if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) response = await augmentHealth(response);

    return stamp(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

function canonicalWebsiteRequest(path, payload) {
  if (path === PLAN_PATH) {
    return payload?.instructionSet === KAIROS_WEBSITE_INSTRUCTION_SET
      && payload?.instructionSource === WEBSITE_SOURCE
      && payload?.canonicalBuildConfirmation === WEBSITE_CONFIRMATION
      && payload?.canonicalInstructionsRequired === true
      && payload?.stagingOnly === true
      && payload?.fullRetoolConfirmed === true
      && payload?.structuralMutationAuthorized === true
      && payload?.styleMutationAuthorized === true
      && payload?.visualMutationAuthorized === true
      && payload?.liveThemeMutationAuthorized !== true;
  }
  const approval = payload?.approval || {};
  const websiteRetool = payload?.websiteRetool || {};
  return approval?.instructionSet === KAIROS_WEBSITE_INSTRUCTION_SET
    && approval?.canonicalBuildConfirmation === WEBSITE_CONFIRMATION
    && approval?.stagingOnly === true
    && approval?.status === "approved"
    && approval?.structuralMutationAuthorized === true
    && approval?.styleMutationAuthorized === true
    && approval?.visualMutationAuthorized === true
    && approval?.liveThemeMutationAuthorized !== true
    && websiteRetool?.instructionSet === KAIROS_WEBSITE_INSTRUCTION_SET
    && websiteRetool?.canonicalBuildConfirmation === WEBSITE_CONFIRMATION
    && websiteRetool?.stagingOnly === true
    && websiteRetool?.liveThemeMutationAuthorized !== true;
}

async function augmentContracts(response) {
  const body = await safeResponseJSON(response.clone());
  if (!response.ok || !body?.actions || typeof body.actions !== "object") return response;
  const actions = {};
  for (const [id, contract] of Object.entries(body.actions)) {
    actions[id] = {
      ...contract,
      instructionSet: id === "website" ? KAIROS_WEBSITE_INSTRUCTION_SET : `kairos-action:${id}@v1`,
      instructionSource: id === "website" ? WEBSITE_SOURCE : "KAIROS_ACTION_CONTRACTS",
      coreExecutor: id === "website" ? PLAN_PATH : id === "health" ? "/api/health" : CHILD_EXECUTE_PATH,
      optionalWorkspaceModule: contract?.module || null,
      moduleRequiredForExecution: false,
    };
  }
  return json({ ...body, build: KAIROS_CANONICAL_COMMAND_BUILD, canonicalInstructionWiring: "operational", actions }, response.status, response.headers);
}

async function augmentHealth(response) {
  const body = await safeResponseJSON(response.clone());
  if (!body || typeof body !== "object") return response;
  body.build = KAIROS_CANONICAL_COMMAND_BUILD;
  body.canonicalInstructionWiring = {
    status: "operational",
    browserCoreExecutor: "self-contained",
    childActionRoute: CHILD_EXECUTE_PATH,
    websiteInstructionSet: KAIROS_WEBSITE_INSTRUCTION_SET,
    websiteInstructionSource: WEBSITE_SOURCE,
    websiteStagingBuild: "structural-and-visual-authorized",
    liveThemeMutation: "separate-explicit-release-approval-only",
    optionalWorkspaceModulesRequired: false,
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    canonicalInstructionContracts: "operational",
    builtInChildExecutors: "operational",
    canonicalEnterpriseWebsiteBuild: "operational",
    optionalWorkspaceFailureContainment: "operational",
  };
  return json(body, response.status, response.headers);
}

function cloneJSONRequest(request, payload) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(payload), redirect: request.redirect });
}

function stamp(response, additional = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", KAIROS_CANONICAL_COMMAND_BUILD);
  headers.set("X-Kairos-Canonical-Instruction-Wiring", "operational");
  for (const [key, value] of Object.entries(additional)) headers.set(key, value);
  if (headers.get("Content-Type")?.includes("text/html")) headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function safeJSON(request) { try { return await request.json(); } catch { return {}; } }
async function safeResponseJSON(response) { try { return await response.json(); } catch { return {}; } }
function clean(value, max) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function json(value, status = 200, sourceHeaders = null) {
  const headers = new Headers(sourceHeaders || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-MMG-Runtime", KAIROS_CANONICAL_COMMAND_BUILD);
  headers.set("X-Kairos-Canonical-Instruction-Wiring", "operational");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(value), { status, headers });
}
