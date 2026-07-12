import runtime from "./kairos-standalone-shopify-worker-v1.js";

const BUILD = "kairos-standalone-command-20260712-2";

const ACTIONS = {
  "knowledge-library": { title: "Knowledge Library", operation: "search", input: "Search terms", sections: ["Doctrine", "Specifications", "Research", "Decision records"] },
  "research-brief": { title: "Research Brief", operation: "create", input: "Research question", sections: ["Question", "Scope", "Source requirements", "Evidence review", "Brief status"] },
  "decision-record": { title: "Decision Record", operation: "record", input: "Decision", sections: ["Decision", "Rationale", "Authority", "Dependencies", "Implementation impact"] },
  "publishing-studio": { title: "Publishing Project", operation: "create", input: "Publication title", sections: ["Manuscript", "Editorial", "Production", "Release preparation"] },
  "creative-studio": { title: "Creative Project", operation: "create", input: "Asset or campaign name", sections: ["Brief", "Assets", "Production", "Approval"] },
  "product-launch": { title: "Product Launch", operation: "start", input: "Product or offer", sections: ["Offer", "Audience", "Assets", "Channels", "Readiness"] },
  "revenue-intelligence": { title: "Revenue Review", operation: "run", input: "Review period or objective", sections: ["Data source", "Revenue", "Product performance", "Trends", "Evidence"] },
  "growth-plan": { title: "Growth Plan", operation: "create", input: "Growth objective", sections: ["Objective", "Constraints", "Initiatives", "Milestones", "Metrics"] },
  "visitor-activity": { title: "Visitor Activity", operation: "inspect", input: "", sections: ["Analytics source", "Traffic", "Journeys", "Conversions"] },
  "customer-portal": { title: "Customer Portal", operation: "open", input: "Customer or project", sections: ["Projects", "Approvals", "Files", "Messages", "Billing"] },
  "deliverables": { title: "Deliverables", operation: "open", input: "Project or customer", sections: ["Completed work", "Verification", "Release status", "Delivery"] },
  "work-queue": { title: "Work Queue", operation: "inspect", input: "", sections: ["Active", "Waiting", "Completed", "Blocked"] },
  "release-control": { title: "Release Control", operation: "inspect", input: "Release or project", sections: ["Pending approvals", "Verified releases", "Rollback packages", "History"] },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/hub/run" && request.method === "POST") {
      return runAction(request);
    }

    if (url.pathname === "/api/health" || url.pathname === "/api/capabilities") {
      const response = await runtime.fetch(request, env, ctx);
      const body = await readJSON(response.clone());
      body.build = BUILD;
      body.kernel = "standalone-command-v2";
      body.openaiAPIUsed = false;
      body.capabilities = {
        ...(body.capabilities || {}),
        childCardActionContracts: "operational",
        deterministicInternalWorkItems: "operational",
      };
      return json(body, response.status);
    }

    const response = await runtime.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-command-v2");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

async function runAction(request) {
  try {
    const payload = await request.json();
    const action = String(payload?.action || "").trim().toLowerCase();
    const objective = String(payload?.objective || "").trim();
    const definition = ACTIONS[action];

    if (!definition) {
      return json({ status: "unavailable", build: BUILD, error: { code: "unknown_child_action", message: "This child-card action is not registered." } }, 404);
    }

    if (definition.input && objective.length < 2) {
      return json({ status: "needs-input", build: BUILD, error: { code: "action_input_required", message: `Enter ${definition.input.toLowerCase()} before running this action.` } }, 400);
    }

    const now = new Date().toISOString();
    const workItemID = crypto.randomUUID();
    const connectorRequired = ["knowledge-library", "revenue-intelligence", "visitor-activity", "customer-portal", "deliverables"].includes(action);
    const status = connectorRequired ? "prepared-awaiting-connector" : "created";
    const summary = connectorRequired
      ? `${definition.title} action prepared. The destination contract is active; its authoritative data connector must be promoted before live records can be returned.`
      : `${definition.title} work item created and ready for the next governed step.`;

    return json({
      status,
      build: BUILD,
      kernel: "standalone-command-v2",
      openaiAPIUsed: false,
      action,
      operation: definition.operation,
      workItemID,
      createdAt: now,
      title: objective || definition.title,
      summary,
      destination: definition.title,
      sections: definition.sections.map(name => ({ name, status: connectorRequired ? "awaiting-connector" : "ready" })),
      nextAction: connectorRequired ? "Promote and connect the authoritative data adapter." : "Open this work item and continue the destination-specific workflow.",
      evidence: { source: "deterministic-child-card-contract", externalActionTaken: false },
    });
  } catch (error) {
    return json({ status: "failed", build: BUILD, error: { code: "child_action_failed", message: error instanceof Error ? error.message : "The child-card action failed." } }, 500);
  }
}

async function readJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Kernel": "standalone-command-v2",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
