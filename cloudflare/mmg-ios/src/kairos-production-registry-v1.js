const BUILD = "kairos-production-registry-20260722-2";
const REGISTRY_OBJECT = "mmg-production-project-registry";
const MAX_PROJECTS = 250;

export async function handleProductionRegistry(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/production-registry")) return null;
  if (!env.KAIROS_PROJECTS) {
    return json({
      status: "needs-configuration",
      error: {
        code: "production_registry_unavailable",
        message: "The persistent Kairos project runtime is not configured.",
      },
    }, 503);
  }

  const id = env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT);
  const stub = env.KAIROS_PROJECTS.get(id);
  const suffix = url.pathname.replace(/^\/api\/production-registry/, "") || "/";
  const targetURL = `https://kairos.internal/registry${suffix}${url.search}`;

  if (isManuscriptSetupMutation(url.pathname, request.method)) {
    return stub.fetch(await bufferedForwardRequest(request, targetURL));
  }

  return stub.fetch(new Request(targetURL, request));
}

export async function handleRegistryObjectRequest(state, request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/registry")) return null;

  if (url.pathname === "/registry/projects" && request.method === "GET") {
    const records = await readRecords(state);
    const status = String(url.searchParams.get("status") || "").trim();
    const type = String(url.searchParams.get("type") || "").trim();
    const items = Object.values(records)
      .filter((item) => !status || item.status === status)
      .filter((item) => !type || item.projectType === type)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return json({ status: "ready", build: BUILD, count: items.length, projects: items });
  }

  if (url.pathname === "/registry/projects" && request.method === "POST") {
    const body = await request.json();
    const project = normalizeProject(body);
    const records = await readRecords(state);
    const existing = records[project.projectId] || null;
    records[project.projectId] = {
      ...(existing || {}),
      ...project,
      createdAt: existing?.createdAt || project.createdAt,
      updatedAt: new Date().toISOString(),
      revision: Number(existing?.revision || 0) + 1,
    };
    prune(records);
    await state.storage.put("production-registry", records);
    return json({ status: existing ? "updated" : "created", build: BUILD, project: records[project.projectId] }, existing ? 200 : 201);
  }

  const match = url.pathname.match(/^\/registry\/projects\/([a-z0-9-]{8,})$/i);
  if (match && request.method === "GET") {
    const records = await readRecords(state);
    const project = records[match[1]];
    return project
      ? json({ status: "ready", build: BUILD, project })
      : json({ status: "not-found", error: { code: "production_project_not_found", message: "The production project was not found." } }, 404);
  }

  if (match && request.method === "PATCH") {
    const records = await readRecords(state);
    const current = records[match[1]];
    if (!current) return json({ status: "not-found", error: { code: "production_project_not_found", message: "The production project was not found." } }, 404);
    const patch = await request.json();
    const next = normalizeProject({ ...current, ...patch, projectId: current.projectId, createdAt: current.createdAt });
    records[current.projectId] = {
      ...current,
      ...next,
      updatedAt: new Date().toISOString(),
      revision: Number(current.revision || 0) + 1,
    };
    await state.storage.put("production-registry", records);
    return json({ status: "updated", build: BUILD, project: records[current.projectId] });
  }

  if (match && request.method === "DELETE") {
    const records = await readRecords(state);
    const current = records[match[1]];
    if (!current) return json({ status: "not-found", error: { code: "production_project_not_found", message: "The production project was not found." } }, 404);
    records[current.projectId] = {
      ...current,
      status: "archived",
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: Number(current.revision || 0) + 1,
    };
    await state.storage.put("production-registry", records);
    return json({ status: "archived", build: BUILD, project: records[current.projectId] });
  }

  return json({ status: "not-found", error: { code: "production_registry_route_not_found", message: "Production registry route not found." } }, 404);
}

function isManuscriptSetupMutation(pathname, method) {
  return !["GET", "HEAD"].includes(String(method || "GET").toUpperCase())
    && /^\/api\/production-registry\/manuscripts\/[a-z0-9-]{8,}\/setup(?:\/cover)?$/i.test(pathname);
}

async function bufferedForwardRequest(request, targetURL) {
  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.delete("Content-Length");
  headers.set("X-Kairos-Registry-Forwarding", BUILD);

  const body = await request.arrayBuffer();
  return new Request(targetURL, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });
}

async function readRecords(state) {
  return (await state.storage.get("production-registry")) || {};
}

function normalizeProject(input) {
  const projectId = String(input?.projectId || crypto.randomUUID()).trim();
  if (!/^[a-z0-9-]{8,}$/i.test(projectId)) throw Object.assign(new Error("A valid production project ID is required."), { status: 400 });
  const projectType = ["complete-product", "manuscript-studio"].includes(input?.projectType) ? input.projectType : "complete-product";
  const status = String(input?.status || "active").slice(0, 80);
  return {
    projectId,
    projectType,
    title: String(input?.title || (projectType === "complete-product" ? "Untitled Product" : "Untitled Manuscript")).slice(0, 240),
    status,
    stage: String(input?.stage || "intake").slice(0, 120),
    progress: clamp(Number(input?.progress || 0), 0, 100),
    activeWorkspace: String(input?.activeWorkspace || projectType).slice(0, 80),
    sourceProjectId: String(input?.sourceProjectId || "").slice(0, 120) || null,
    sourceReleaseId: String(input?.sourceReleaseId || "").slice(0, 120) || null,
    summary: String(input?.summary || "").slice(0, 2000),
    nextAction: String(input?.nextAction || "Resume production work.").slice(0, 1000),
    checkpoints: Array.isArray(input?.checkpoints) ? input.checkpoints.slice(0, 30).map(normalizeCheckpoint) : [],
    createdAt: validDate(input?.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownerScope: "mmg-executive",
    externalInferenceAPI: false,
  };
}

function normalizeCheckpoint(value) {
  return {
    id: String(value?.id || crypto.randomUUID()).slice(0, 120),
    label: String(value?.label || "Production checkpoint").slice(0, 240),
    status: String(value?.status || "pending").slice(0, 80),
    recordedAt: validDate(value?.recordedAt) || new Date().toISOString(),
  };
}

function prune(records) {
  const entries = Object.values(records).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  for (const item of entries.slice(MAX_PROJECTS)) delete records[item.projectId];
}

function validDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Registry": BUILD,
    },
  });
}
