import runtime, { KairosProject } from "./kairos-production-entry-v37.js";
import {
  handleChildActionRequest,
  KAIROS_CHILD_ACTION_RUNTIME_BUILD,
} from "./kairos-child-action-runtime-v1.js";

const BUILD = "kairos-production-entry-20260716-95";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const childAction = await handleChildActionRequest(
        request,
        env,
        ctx,
        next => runtime.fetch(next, env, ctx),
      );
      if (childAction) return stamp(childAction);
    } catch (error) {
      return jsonError(
        Number(error?.statusCode || error?.status || 500),
        error?.code || "child_action_runtime_failed",
        error instanceof Error ? error.message : "Kairos child-action execution failed.",
      );
    }

    let response = await runtime.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === "GET" && ["/api/health", "/api/capabilities"].includes(url.pathname)) {
      response = await addChildActionHealth(response);
    }
    return stamp(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof runtime.scheduled === "function") return runtime.scheduled(controller, env, ctx);
  },
};

async function addChildActionHealth(response) {
  let body;
  try { body = await response.clone().json(); }
  catch { return response; }
  body.build = BUILD;
  body.childActionExecution = {
    status: "operational",
    build: KAIROS_CHILD_ACTION_RUNTIME_BUILD,
    contract: "objective-to-verified-deliverable",
    persistence: "durable-object-readback",
    domainEvidence: "read-only-authoritative-snapshot",
    websiteRetool: "separate-approval-pipeline",
  };
  body.capabilities = {
    ...(body.capabilities || {}),
    synchronousChildActionExecution: "operational",
    verifiedChildDeliverableReadback: "required",
    queuedAcknowledgementOnly: "retired",
    childWorkspaceObjectiveBridge: "operational",
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

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Production-Entry", BUILD);
  headers.set("X-Kairos-Child-Action-Runtime", KAIROS_CHILD_ACTION_RUNTIME_BUILD);
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
      "X-Kairos-Child-Action-Runtime": KAIROS_CHILD_ACTION_RUNTIME_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
