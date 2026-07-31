import { handleManuscriptSourceObjectRequest } from "./kairos-manuscript-source-v1.js";

export const KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD = "kairos-manuscript-source-shard-20260730-1";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const PUBLIC_SOURCE_ROUTE = /^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/source(?:\/(?:download|text|session|commit|file\/\d+|text-chunk\/\d+))?$/i;
const INTERNAL_SOURCE_ROUTE = /^\/registry\/manuscripts\/([a-z0-9-]{8,})\/source(?:\/(?:download|text|session|commit|file\/\d+|text-chunk\/\d+))?$/i;
const BUFFERED_METHODS = new Set(["POST", "PUT", "PATCH"]);

export class KairosManuscriptSource {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const response = await handleManuscriptSourceObjectRequest(this.state, request);
    if (response) return stamp(response);
    return json({
      status: "not-found",
      error: {
        code: "manuscript_source_shard_route_not_found",
        message: "The manuscript source shard route was not found.",
      },
      build: KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD,
    }, 404);
  }
}

export async function handleDedicatedManuscriptSource(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(PUBLIC_SOURCE_ROUTE);
  if (!match) return null;

  if (!env?.KAIROS_MANUSCRIPT_SOURCES?.idFromName || !env?.KAIROS_MANUSCRIPT_SOURCES?.get) {
    return json({
      status: "needs-configuration",
      error: {
        code: "manuscript_source_shard_unavailable",
        message: "The dedicated manuscript source runtime is not configured.",
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

    return stamp(response);
  } catch (error) {
    return json({
      status: "failed",
      error: {
        code: error?.code || "manuscript_source_shard_forwarding_failed",
        message: error instanceof Error ? error.message : "The dedicated manuscript source request failed.",
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

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Source-Shard", KAIROS_MANUSCRIPT_SOURCE_SHARD_BUILD);
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
