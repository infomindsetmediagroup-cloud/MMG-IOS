import {
  createWorkflow,
  updateTask,
  updateWorkflow,
} from "./kairos-workflow-runtime-v1.js";
import {
  findInternalDoctrines,
  KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
  listInternalDoctrines,
} from "./kairos-internal-doctrine-registry-v1.js";

export const KAIROS_ZERO_NEURON_CHILD_ROUTER_BUILD = "kairos-zero-neuron-child-router-20260717-1";

const RUN_PATH = "/api/hub/run";

const ZERO_INFERENCE_ACTIONS = new Set([
  "knowledge-library",
  "decision-record",
  "doctrine-vault",
  "revenue-intelligence",
  "visitor-activity",
  "customer-portal",
  "deliverables",
  "support-intelligence",
  "health",
  "work-queue",
  "release-control",
  "executive-briefing",
  "system-registry",
]);

const ACTION_TITLES = Object.freeze({
  "knowledge-library": "Knowledge Library",
  "decision-record": "Decision Record",
  "doctrine-vault": "Doctrine Vault",
  "revenue-intelligence": "Revenue Intelligence",
  "visitor-activity": "Visitor Activity",
  "customer-portal": "Customer Portal",
  deliverables: "Deliverables",
  "support-intelligence": "Support Intelligence",
  health: "Runtime Health",
  "work-queue": "Work Queue",
  "release-control": "Release Control",
  "executive-briefing": "Executive Briefing",
  "system-registry": "System Registry",
});

export async function handleZeroNeuronChildRequest(request, env, ctx, delegate) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/internal-intelligence/status") {
    return json({
      status: "operational",
      build: KAIROS_ZERO_NEURON_CHILD_ROUTER_BUILD,
      doctrineRegistry: KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
      workersAIEnabledForChildRequests: false,
      workersAIUsed: false,
      neuronsConsumed: 0,
      inferencePolicy: "authoritative retrieval first; private Kairos runtime only for genuinely generative work",
      zeroInferenceActions: [...ZERO_INFERENCE_ACTIONS],
      doctrineCount: listInternalDoctrines().length,
    });
  }

  if (request.method !== "POST" || url.pathname !== RUN_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  const action = clean(payload?.action, 120).toLowerCase();
  if (!ZERO_INFERENCE_ACTIONS.has(action)) return null;

  const objective = clean(payload?.objective, 12000);
  const title = ACTION_TITLES[action] || "Kairos Internal Action";
  const workflow = await createWorkflow(request, {
    title: `${title} · ${shortTitle(objective || `Open ${title}`)}`,
    objective: objective || `Open ${title} using authoritative internal records.`,
    center: action === "revenue-intelligence" ? "business" : action === "visitor-activity" || action === "customer-portal" || action === "deliverables" || action === "support-intelligence" ? "customers" : action === "health" || action === "work-queue" || action === "release-control" || action === "executive-briefing" || action === "system-registry" ? "operations" : "knowledge",
    owner: "Kairos",
    source: `internal-zero-neuron/${action}`,
    tasks: [
      { title: "Resolve the internal request", description: "Use the action and objective without model inference." },
      { title: "Read authoritative internal records", description: "Retrieve canonical records or the existing domain result." },
      { title: "Verify and return the result", description: "Preserve the direct result and zero-inference receipt." },
    ],
  });
  await updateWorkflow(request, workflow.id, { command: "start" });

  try {
    await updateTask(request, workflow.id, workflow.tasks[0].id, { state: "completed" });

    let result;
    if (action === "doctrine-vault") {
      result = doctrineVaultResult(objective);
    } else if (action === "knowledge-library") {
      const doctrineMatches = findInternalDoctrines(objective, 8);
      result = doctrineMatches.length
        ? knowledgeLibraryDoctrineResult(objective, doctrineMatches)
        : await delegateDirectly(request, delegate, action, title, objective);
    } else {
      result = await delegateDirectly(request, delegate, action, title, objective);
    }

    await updateTask(request, workflow.id, workflow.tasks[1].id, { state: "completed" });
    await updateTask(request, workflow.id, workflow.tasks[2].id, { state: "completed" });
    const completed = await updateWorkflow(request, workflow.id, { command: "complete" });

    return json({
      ...result,
      status: result.status || "completed",
      build: KAIROS_ZERO_NEURON_CHILD_ROUTER_BUILD,
      kernel: "zero-neuron-internal-child-router-v1",
      action,
      workflowID: workflow.id,
      workflow: completed,
      evidence: {
        ...(result.evidence || {}),
        executionMode: "deterministic-internal",
        workersAIUsed: false,
        neuronsConsumed: 0,
        externalInferenceUsed: false,
        privateInferenceUsed: false,
        authoritativeRecordsUsed: true,
        browserSurfaceChanged: false,
      },
    });
  } catch (error) {
    await updateWorkflow(request, workflow.id, { command: "block", reason: safeMessage(error) }).catch(() => null);
    return failure(Number(error?.status || error?.statusCode || 500), error?.code || "internal_zero_neuron_action_failed", safeMessage(error), action);
  }
}

function doctrineVaultResult(objective) {
  const matches = findInternalDoctrines(objective, 8);
  if (!matches.length) {
    const available = listInternalDoctrines();
    return {
      status: "completed",
      workItemID: "doctrine-vault:index",
      summary: "No exact doctrine matched that topic. Kairos opened the canonical internal doctrine index instead.",
      sections: available.map(item => ({
        name: item.title,
        status: item.status,
        content: `Version ${item.version} · Owner: ${item.owner} · Scope: ${item.scope.join(", ")}`,
      })),
      nextAction: "Enter one of the listed doctrine titles to open its complete canonical text.",
      evidence: {
        registry: KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
        queryMatched: false,
        doctrineIDs: available.map(item => item.id),
      },
    };
  }

  const primary = matches[0];
  return {
    status: "completed",
    workItemID: `doctrine:${primary.id}`,
    summary: `Opened ${primary.title} from Kairos’s canonical internal doctrine registry.`,
    sections: matches.map(doctrine => ({
      name: doctrine.title,
      status: doctrine.status,
      content: doctrine.content,
    })),
    nextAction: "Apply this canonical doctrine to the relevant governed planning or execution workspace.",
    evidence: {
      registry: KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
      queryMatched: true,
      primaryDoctrineID: primary.id,
      doctrineIDs: matches.map(item => item.id),
      doctrineVersions: Object.fromEntries(matches.map(item => [item.id, item.version])),
    },
  };
}

function knowledgeLibraryDoctrineResult(objective, matches) {
  return {
    status: "completed",
    workItemID: `knowledge:${crypto.randomUUID()}`,
    summary: `Found ${matches.length} authoritative internal doctrine match${matches.length === 1 ? "" : "es"} without model inference.`,
    sections: matches.map(doctrine => ({
      name: doctrine.title,
      status: doctrine.status,
      content: doctrine.content,
    })),
    nextAction: "Open the relevant doctrine in Doctrine Vault or apply it to the governed work objective.",
    evidence: {
      registry: KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
      query: objective,
      doctrineIDs: matches.map(item => item.id),
    },
  };
}

async function delegateDirectly(request, delegate, action, title, objective) {
  const response = await delegate(request);
  const body = await safeResponseJSON(response.clone());
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.summary || `${title} returned ${response.status}.`);
    error.status = response.status;
    error.code = body?.error?.code || `${action.replace(/-/g, "_")}_failed`;
    throw error;
  }

  const sections = normalizeSections(body, title, objective);
  return {
    ...body,
    status: body?.status || "completed",
    workItemID: body?.workItemID || body?.actionID || `${action}:${crypto.randomUUID()}`,
    summary: clean(body?.summary, 3000) || `${title} completed from authoritative internal records.`,
    sections,
    nextAction: clean(body?.nextAction, 1200) || "Review the authoritative result and continue through the governed workspace.",
    evidence: {
      ...(body?.evidence || {}),
      sourceRuntimeStatus: response.status,
      domainResultReturnedDirectly: true,
    },
  };
}

function normalizeSections(body, title, objective) {
  if (Array.isArray(body?.sections) && body.sections.length) {
    return body.sections.slice(0, 24).map(section => ({
      name: clean(section?.name, 240) || "Result",
      status: clean(section?.status, 80) || "completed",
      content: normalizeContent(section?.content ?? section?.value ?? section?.summary ?? section),
    }));
  }

  const candidates = [];
  for (const [key, value] of Object.entries(body || {})) {
    if (["status", "summary", "nextAction", "workItemID", "actionID", "build", "kernel", "evidence", "workflow"].includes(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    candidates.push({
      name: titleCase(key),
      status: "completed",
      content: normalizeContent(value),
    });
    if (candidates.length >= 12) break;
  }

  return candidates.length ? candidates : [{
    name: title,
    status: "completed",
    content: objective || `${title} completed from current authoritative records.`,
  }];
}

function normalizeContent(value) {
  if (typeof value === "string") return clean(value, 20000);
  try { return clean(JSON.stringify(value, null, 2), 20000); }
  catch { return clean(String(value), 20000); }
}

function titleCase(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function shortTitle(value) {
  const text = clean(value, 180);
  return text.length <= 90 ? text : `${text.slice(0, 87)}…`;
}

function clean(value, max) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function safeMessage(error) {
  return error instanceof Error && error.message ? error.message : "Kairos could not complete this internal operation.";
}

async function safeRequestJSON(request) {
  try { return await request.json(); }
  catch { return {}; }
}

async function safeResponseJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_ZERO_NEURON_CHILD_ROUTER_BUILD,
      "X-Kairos-Doctrine-Registry": KAIROS_INTERNAL_DOCTRINE_REGISTRY_BUILD,
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Neurons-Consumed": "0",
      "X-Kairos-Inference-Mode": "deterministic-internal",
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function failure(status, code, message, action) {
  return json({
    status: status >= 500 ? "failed" : "needs-attention",
    build: KAIROS_ZERO_NEURON_CHILD_ROUTER_BUILD,
    action,
    error: { code, message },
    safeguards: {
      workersAIUsed: false,
      neuronsConsumed: 0,
      externalInferenceUsed: false,
      browserSurfaceChanged: false,
    },
  }, status);
}
