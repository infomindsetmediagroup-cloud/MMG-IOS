import runtime from "./kairos-standalone-shopify-worker-v1.js";

const BUILD = "kairos-standalone-command-20260712-3";

const ACTIONS = {
  "knowledge-library": { title: "Knowledge Library", operation: "search", input: "Search terms", sections: ["Doctrine", "Specifications", "Research", "Decision records"] },
  "research-brief": { title: "Research Brief", operation: "create", input: "Research question", sections: ["Question", "Scope", "Source requirements", "Evidence review", "Brief status"] },
  "decision-record": { title: "Decision Record", operation: "record", input: "Decision", sections: ["Decision", "Rationale", "Authority", "Dependencies", "Implementation impact"] },
  "publishing-studio": { title: "Publishing Project", operation: "create", input: "Publication title", sections: ["Manuscript", "Editorial", "Production", "Release preparation"] },
  "creative-studio": { title: "Creative Project", operation: "create", input: "Asset or campaign name", sections: ["Brief", "Assets", "Production", "Approval"] },
  "product-launch": { title: "Product Launch", operation: "start", input: "Product or offer", sections: ["Offer", "Audience", "Assets", "Channels", "Readiness"] },
  "revenue-intelligence": { title: "Revenue Review", operation: "run", input: "Review period or objective", sections: ["Data source", "Revenue", "Product performance", "Trends", "Evidence"] },
  "growth-plan": { title: "Growth Plan", operation: "build", input: "Growth objective", sections: ["Executive summary", "90-day objective", "Priority audiences", "Growth initiatives", "Milestones", "Metrics", "Risks", "Next action"] },
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
      body.kernel = "standalone-command-v3";
      body.openaiAPIUsed = false;
      body.capabilities = {
        ...(body.capabilities || {}),
        childCardActionContracts: "operational",
        deterministicInternalWorkItems: "operational",
        deterministicGrowthPlanning: "operational",
      };
      return json(body, response.status);
    }

    const response = await runtime.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Kernel", "standalone-command-v3");
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

    if (action === "growth-plan") {
      return json(buildGrowthPlan(objective));
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
      kernel: "standalone-command-v3",
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

function buildGrowthPlan(objective) {
  const now = new Date().toISOString();
  const workItemID = crypto.randomUUID();
  const sections = [
    {
      name: "Executive summary",
      status: "completed",
      content: `MMG will pursue the stated objective through a focused 90-day operating cycle that connects audience growth, ecosystem discovery, offer clarity, conversion, and customer retention. The plan preserves MMG's premium brand, knowledge-stewardship doctrine, and execution-first operating model.`,
    },
    {
      name: "90-day objective",
      status: "completed",
      content: objective,
    },
    {
      name: "Priority audiences",
      status: "completed",
      content: "1. Creators seeking practical growth systems. 2. Authors and experts converting knowledge into durable products. 3. Entrepreneurs needing coordinated brand, content, AI, and publishing support. 4. Existing MMG visitors who have not yet entered a guided pathway.",
    },
    {
      name: "Growth initiatives",
      status: "completed",
      content: "1. Guided homepage and ecosystem pathways. 2. One primary lead-capture offer tied to the Free Creator Toolkit and Knowledge Library. 3. Consistent creator-education distribution across TikTok, short-form video, email, and the MMG website. 4. Productized journeys for publishing, creator growth, AI learning, and business development. 5. Weekly conversion and retention review using verified source data only.",
    },
    {
      name: "Milestones",
      status: "completed",
      content: "Days 1–14: clarify pathways, offers, and measurement. Days 15–30: launch lead capture and core content cadence. Days 31–60: optimize conversion points and product journeys. Days 61–90: scale the strongest verified channels and retire low-performing work.",
    },
    {
      name: "Metrics",
      status: "completed",
      content: "Track verified website sessions, qualified leads, email opt-ins, pathway engagement, product-page conversion, customer acquisition, repeat purchase, subscription adoption, content reach, and completed customer outcomes. Baselines must be recorded before numerical targets are approved.",
    },
    {
      name: "Risks and constraints",
      status: "completed",
      content: "Primary risks are fragmented execution, unsupported analytics, too many simultaneous initiatives, unclear offers, and overreliance on a single social channel. Mitigate through bounded weekly priorities, verified evidence, one accountable owner per initiative, and explicit stop conditions.",
    },
    {
      name: "Weekly operating cadence",
      status: "completed",
      content: "Monday: priorities and dependencies. Wednesday: production and distribution check. Friday: verified metrics, decisions, and next-week adjustments. Preserve visible progress through completed assets, milestones, customer outcomes, and knowledge growth.",
    },
    {
      name: "Recommended next action",
      status: "completed",
      content: "Establish the current verified baseline for traffic, leads, conversions, revenue, products, subscriptions, and content performance; then approve the first two-week execution sprint.",
    },
  ];

  return {
    status: "completed",
    build: BUILD,
    kernel: "standalone-command-v3",
    openaiAPIUsed: false,
    action: "growth-plan",
    operation: "build",
    workItemID,
    createdAt: now,
    title: "MMG Growth Plan",
    summary: "The deterministic MMG growth plan is complete and ready for execution review.",
    destination: "Growth Plan",
    objective,
    sections,
    nextAction: "Review the completed plan, establish verified baselines, and approve the first two-week execution sprint.",
    evidence: { source: "deterministic-growth-plan-v1", externalActionTaken: false, assumptionsRequireVerification: true },
  };
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
      "X-Kairos-Kernel": "standalone-command-v3",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
