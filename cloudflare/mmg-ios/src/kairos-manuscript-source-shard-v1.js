import { handleManuscriptSourceObjectRequest } from "./kairos-manuscript-source-v1.js";
import { handleManuscriptProjectSetupObjectRequest } from "./kairos-manuscript-project-setup-v1.js";
import { handleManuscriptEditorialObjectRequest } from "./kairos-manuscript-editorial-workbench-v1.js";
import { handleManuscriptDeliverablesObjectRequest } from "./kairos-manuscript-deliverables-http-v1.js";

export const KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD = "kairos-manuscript-source-shard-20260803-2-deliverables-builder";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const PUBLIC_MANUSCRIPT_ROUTE = /^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/(?:source(?:\/(?:download|text|session|commit|file\/\d+|text-chunk\/\d+))?|setup(?:\/cover)?|editorial(?:\/(?:versions(?:\/[a-z0-9-]{8,})?|review|decision|finalize))?|deliverables(?:\/(?:build|zip))?)$/i;
const INTERNAL_SOURCE_ROUTE = /^\/registry\/manuscripts\/([a-z0-9-]{8,})\/(?:source(?:\/(?:download|text|session|commit|file\/\d+|text-chunk\/\d+))?|setup(?:\/cover)?|editorial(?:\/(?:versions(?:\/[a-z0-9-]{8,})?|review|decision|finalize))?|deliverables(?:\/(?:build|zip))?)$/i;
const BUFFERED_METHODS = new Set(["POST", "PUT", "PATCH"]);

export class KairosManuscriptSource {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const deliverablesResponse = await handleManuscriptDeliverablesObjectRequest(this.state, request, {
      handleManuscriptSourceObjectRequest,
      handleManuscriptProjectSetupObjectRequest,
      handleManuscriptEditorialObjectRequest,
    });
    if (deliverablesResponse) return stamp(deliverablesResponse);

    const editorialResponse = await handleManuscriptEditorialObjectRequest(this.state, request);
    if (editorialResponse) return stamp(editorialResponse);

    const setupResponse = await handleManuscriptProjectSetupObjectRequest(this.state, request);
    if (setupResponse) return stamp(setupResponse);

    const sourceResponse = await handleManuscriptSourceObjectRequest(this.state, request);
    if (sourceResponse) return stamp(sourceResponse);

    return json({
      status: "not-found",
      error: {
        code: "manuscript_project_shard_route_not_found",
        message: "The manuscript project shard route was not found.",
      },
      build: KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
    }, 404);
  }
}

export async function handleDedicatedManuscriptSource(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(PUBLIC_MANUSCRIPT_ROUTE);
  if (!match) return null;

  if (!env?.KAIROS_MANUSCRIPT_SOURCES?.idFromName || !env?.KAIROS_MANUSCRIPT_SOURCES?.get) {
    return json({
      status: "needs-configuration",
      error: {
        code: "manuscript_source_shard_unavailable",
        message: "The dedicated manuscript project runtime is not configured.",
      },
      build: KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
    }, 503);
  }

  const projectId = match[1];
  const id = env.KAIROS_MANUSCRIPT_SOURCES.idFromName(projectId);
  const stub = env.KAIROS_MANUSCRIPT_SOURCES.get(id);
  const suffix = url.pathname.replace(/^\/api\/production-registry/, "") || "/";
  const targetURL = `https://kairos.internal/registry${suffix}${url.search}`;

  try {
    const forwarded = await forwardRequest(request, targetURL);
    const response = await stub.fetch(forwarded);

    if (request.method === "POST" && url.pathname.endsWith("/commit") && response.ok) {
      const body = await response.clone().json().catch(() => ({}));
      if (body?.source) await ensureGlobalProject(env, projectId, body.source);
    }

    if (request.method === "POST" && url.pathname.endsWith("/setup") && response.ok) {
      const body = await response.clone().json().catch(() => ({}));
      if (body?.setup) {
        try {
          await ensureGlobalSetup(env, projectId, body);
          return stamp(response, { "X-Kairos-Global-Project-Mirror": "synced" });
        } catch (error) {
          console.error("Kairos stored manuscript setup but could not mirror the global project immediately.", error);
          return stamp(response, { "X-Kairos-Global-Project-Mirror": "pending" });
        }
      }
    }

    if (isEditorialMutation(request.method, url.pathname) && response.ok) {
      const body = await response.clone().json().catch(() => ({}));
      if (body?.editorial) {
        try {
          await ensureGlobalEditorial(env, projectId, body, stub);
          return stamp(response, { "X-Kairos-Global-Project-Mirror": "synced" });
        } catch (error) {
          console.error("Kairos stored manuscript editorial state but could not mirror the global project immediately.", error);
          return stamp(response, { "X-Kairos-Global-Project-Mirror": "pending" });
        }
      }
    }

    return stamp(response);
  } catch (error) {
    return json({
      status: "failed",
      error: {
        code: error?.code || "manuscript_source_shard_forwarding_failed",
        message: error instanceof Error ? error.message : "The dedicated manuscript project request failed.",
        retriable: true,
      },
      build: KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
    }, Number(error?.status || 503));
  }
}

async function forwardRequest(request, targetURL) {
  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.delete("Content-Length");
  headers.set("X-Kairos-Source-Shard", KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD);

  if (!BUFFERED_METHODS.has(request.method.toUpperCase())) {
    return new Request(targetURL, {
      method: request.method,
      headers,
      redirect: "manual",
    });
  }

  const body = await request.arrayBuffer();
  return new Request(targetURL, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });
}

async function ensureGlobalProject(env, projectId, source) {
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) return;
  const id = env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT);
  const stub = env.KAIROS_PROJECTS.get(id);
  const now = new Date().toISOString();
  const response = await stub.fetch(new Request("https://kairos.internal/registry/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kairos-Source-Shard": KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
    },
    body: JSON.stringify({
      projectId,
      projectType: "manuscript-studio",
      title: source.title || source.filename || "Untitled Manuscript",
      status: "source-stored",
      stage: "source-intake",
      progress: 10,
      activeWorkspace: "manuscript-studio",
      summary: "Original manuscript source and extracted text are stored in a dedicated Kairos source runtime.",
      nextAction: "Continue to production intake.",
      checkpoints: [{
        id: "durable-source",
        label: "Original manuscript source stored",
        status: "completed",
        recordedAt: source.storedAt || now,
      }],
      createdAt: source.storedAt || now,
    }),
  }));

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error(body?.error?.message || "The global production registry could not record the stored source."), {
      status: response.status,
      code: body?.error?.code || "manuscript_source_registry_mirror_failed",
    });
  }
}

async function ensureGlobalSetup(env, projectId, body) {
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) return;
  const setup = body?.setup;
  if (!setup) return;

  const id = env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT);
  const stub = env.KAIROS_PROJECTS.get(id);
  const now = new Date().toISOString();
  const milestones = Array.isArray(setup.milestones) ? setup.milestones : [];
  const checkpoints = milestones.length
    ? milestones.slice(0, 30).map((milestone) => ({
      id: String(milestone?.id || crypto.randomUUID()).slice(0, 120),
      label: String(milestone?.label || "Production milestone").slice(0, 240),
      status: String(milestone?.status || "pending").slice(0, 80),
      recordedAt: milestone?.recordedAt || setup.updatedAt || now,
    }))
    : [{
      id: "project-setup",
      label: "Project setup and production assignment completed",
      status: "completed",
      recordedAt: setup.updatedAt || now,
    }];

  const response = await stub.fetch(new Request("https://kairos.internal/registry/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kairos-Source-Shard": KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
    },
    body: JSON.stringify({
      projectId,
      projectType: "manuscript-studio",
      title: setup.publicationTitle || "Untitled Manuscript",
      status: setup.status || body.status || "assigned-to-production",
      stage: setup.currentStage || "project-setup",
      progress: Number(setup.progress || 40),
      activeWorkspace: "manuscript-studio",
      summary: [setup.authorName, setup.service, setup.coverStatus].filter(Boolean).join(" · "),
      nextAction: body.nextAction || (setup.cover ? "Begin editorial and production work." : "Upload the customer-supplied cover."),
      checkpoints,
      createdAt: setup.createdAt || now,
    }),
  }));

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw Object.assign(new Error(result?.error?.message || "The global production registry could not record project setup."), {
      status: response.status,
      code: result?.error?.code || "manuscript_setup_registry_mirror_failed",
    });
  }
}

async function ensureGlobalEditorial(env, projectId, body, projectStub) {
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) return;
  const editorial = body?.editorial;
  if (!editorial) return;

  const setupResponse = await projectStub.fetch(new Request(
    `https://kairos.internal/registry/manuscripts/${encodeURIComponent(projectId)}/setup`,
    { method: "GET" },
  ));
  const setupBody = setupResponse.ok ? await setupResponse.json().catch(() => ({})) : {};
  const setup = setupBody?.setup || {};
  const now = new Date().toISOString();
  const status = String(editorial.status || "editorial-in-progress");
  const stage = String(editorial.stage || "editorial-intake");

  const id = env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT);
  const stub = env.KAIROS_PROJECTS.get(id);
  const response = await stub.fetch(new Request("https://kairos.internal/registry/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kairos-Source-Shard": KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
    },
    body: JSON.stringify({
      projectId,
      projectType: "manuscript-studio",
      title: setup.publicationTitle || editorial.title || "Untitled Manuscript",
      status,
      stage,
      progress: editorialProgress(status, stage),
      activeWorkspace: "manuscript-studio",
      summary: editorialSummary(status, editorial),
      nextAction: editorialNextAction(status),
      checkpoints: [{
        id: `editorial-${status}`.slice(0, 120),
        label: editorialCheckpointLabel(status),
        status: "completed",
        recordedAt: editorial.updatedAt || now,
      }],
      createdAt: setup.createdAt || editorial.createdAt || now,
    }),
  }));

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw Object.assign(new Error(result?.error?.message || "The global production registry could not record editorial progress."), {
      status: response.status,
      code: result?.error?.code || "manuscript_editorial_registry_mirror_failed",
    });
  }
}

function isEditorialMutation(method, pathname) {
  return String(method || "GET").toUpperCase() === "POST"
    && /^\/api\/production-registry\/manuscripts\/[a-z0-9-]{8,}\/editorial\/(?:versions|review|decision|finalize)$/i.test(pathname);
}

function editorialProgress(status, stage) {
  if (status === "ready-for-manufacturing") return 90;
  if (status === "customer-approved") return 82;
  if (status === "awaiting-customer-review") return 70;
  if (status === "revision-requested") return 68;
  return ({ structural: 45, copyedit: 55, proofread: 78, "customer-revision": 68, final: 88 })[stage] || 40;
}

function editorialSummary(status, editorial) {
  const versionCount = Array.isArray(editorial?.versions) ? editorial.versions.length : 0;
  if (status === "ready-for-manufacturing") return "Editorial production is complete and the approved manuscript is ready for manufacturing.";
  if (status === "customer-approved") return "Customer approval is recorded for the active editorial proof.";
  if (status === "awaiting-customer-review") return "The active editorial proof is awaiting customer review.";
  if (status === "revision-requested") return "A customer revision request is recorded in the editorial workbench.";
  return `${versionCount} governed editorial version${versionCount === 1 ? " is" : "s are"} stored for this manuscript.`;
}

function editorialNextAction(status) {
  if (status === "ready-for-manufacturing") return "Generate final publishing deliverables.";
  if (status === "customer-approved") return "Complete final proofread and manufacturing handoff.";
  if (status === "awaiting-customer-review") return "Record the customer approval or revision request.";
  if (status === "revision-requested") return "Create a revised editorial version and prepare a new review.";
  return "Continue the governed editorial pass and save the next version.";
}

function editorialCheckpointLabel(status) {
  return ({
    "editorial-in-progress": "Editorial version stored",
    "awaiting-customer-review": "Customer editorial review prepared",
    "customer-approved": "Customer editorial approval recorded",
    "revision-requested": "Customer editorial revision requested",
    "ready-for-manufacturing": "Editorial production completed",
  })[status] || "Editorial workbench updated";
}

function stamp(response, extraHeaders = {}) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Source-Shard", KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD);
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
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
      "X-Kairos-Source-Shard": KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
    },
  });
}

export function isInternalManuscriptSourceRoute(pathname) {
  return INTERNAL_SOURCE_ROUTE.test(String(pathname || ""));
}
