const BUILD = "kairos-publishing-package-20260722-1";
const PROJECT_PREFIX = "/api/kairos/projects";
const MAX_COVER_BYTES = 25 * 1024 * 1024;
const MAX_MANUSCRIPT_BYTES = 100 * 1024 * 1024;

const COVER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MANUSCRIPT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "text/plain",
  "text/markdown",
]);

const STAGES = [
  "INTAKE",
  "SOURCE_VALIDATION",
  "MANUSCRIPT_EXTRACTION",
  "METADATA_INFERENCE",
  "EDITORIAL_ANALYSIS",
  "DELIVERABLE_GENERATION",
  "PRODUCT_METADATA_GENERATION",
  "PACKAGE_ASSEMBLY",
  "REVIEW",
  "SHOPIFY_STAGING_HANDOFF",
];

export async function handlePublishingPackage(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PROJECT_PREFIX)) return null;

  const authFailure = authorize(request, env);
  if (authFailure) return authFailure;

  if (!env.KAIROS_PROJECTS) {
    return error("publishing_storage_unavailable", "KAIROS_PROJECTS binding is unavailable.", 503);
  }

  if (request.method === "POST" && url.pathname === PROJECT_PREFIX) {
    const projectId = crypto.randomUUID();
    const target = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(`publishing:${projectId}`));
    const payload = await readJSON(request);
    return target.fetch(internalRequest(request, `/internal/publishing/projects/${projectId}`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    }));
  }

  const match = url.pathname.match(/^\/api\/kairos\/projects\/([^/]+)(?:\/(assets|run|status|package))?$/);
  if (!match) return error("route_not_found", "Publishing route not found.", 404);

  const projectId = decodeURIComponent(match[1]);
  const action = match[2] || "project";
  if (!isProjectId(projectId)) return error("invalid_project_id", "Project ID is invalid.", 400);

  const target = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(`publishing:${projectId}`));
  const internalPath = `/internal/publishing/projects/${encodeURIComponent(projectId)}/${action}`;
  return target.fetch(internalRequest(request, internalPath));
}

export async function handlePublishingPackageObjectRequest(state, request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/internal/publishing/projects/")) return null;

  const match = url.pathname.match(/^\/internal\/publishing\/projects\/([^/]+)(?:\/(assets|run|status|package|project))?$/);
  if (!match) return error("route_not_found", "Internal publishing route not found.", 404);

  const projectId = decodeURIComponent(match[1]);
  const action = match[2] || "project";
  const key = "publishing:project";

  if (request.method === "POST" && action === "project") {
    const existing = await state.storage.get(key);
    if (existing) return error("project_exists", "Project already exists.", 409);

    const metadata = sanitizeMetadata(await readJSON(request));
    const now = new Date().toISOString();
    const project = {
      id: projectId,
      schemaVersion: "1.0.0",
      status: "DRAFT",
      metadata,
      sourceAssets: [],
      stages: STAGES.map((name) => ({ name, status: "PENDING" })),
      artifacts: [],
      createdAt: now,
      updatedAt: now,
      run: null,
      governance: {
        liveShopifyMutationAuthorized: false,
        shopifyTargetStatus: "DRAFT",
      },
    };

    await state.storage.put(key, project);
    return json({ status: "created", build: BUILD, project }, 201);
  }

  const project = await state.storage.get(key);
  if (!project) return error("project_not_found", "Project not found.", 404);

  if (request.method === "GET" && (action === "project" || action === "status")) {
    return json({ status: "completed", build: BUILD, project });
  }

  if (request.method === "POST" && action === "assets") {
    const role = new URL(request.url).searchParams.get("role");
    if (role !== "COVER_SOURCE" && role !== "MANUSCRIPT_SOURCE") {
      return error("invalid_asset_role", "role must be COVER_SOURCE or MANUSCRIPT_SOURCE.", 400);
    }
    if (project.sourceAssets.some((asset) => asset.role === role)) {
      return error("duplicate_source_asset", `${role} already exists.`, 409);
    }

    const mimeType = normalizeMime(request.headers.get("Content-Type"));
    const filename = sanitizeFilename(request.headers.get("X-Filename") || defaultFilename(role, mimeType));
    const bytes = new Uint8Array(await request.arrayBuffer());
    const validation = validateAsset(role, mimeType, bytes.byteLength);
    if (validation) return validation;

    const sha256 = await digestHex(bytes);
    const assetId = crypto.randomUUID();
    const storageKey = `publishing:asset:${assetId}`;
    const createdAt = new Date().toISOString();
    const asset = {
      id: assetId,
      projectId,
      role,
      filename,
      mimeType,
      byteSize: bytes.byteLength,
      sha256,
      storageKey,
      immutable: true,
      createdAt,
    };

    await state.storage.transaction(async (txn) => {
      await txn.put(storageKey, bytes);
      const updated = {
        ...project,
        sourceAssets: [...project.sourceAssets, asset],
        status: project.sourceAssets.length === 1 ? "READY" : "DRAFT",
        updatedAt: createdAt,
      };
      await txn.put(key, updated);
    });

    const updated = await state.storage.get(key);
    return json({ status: "created", build: BUILD, asset, project: updated }, 201);
  }

  if (request.method === "POST" && action === "run") {
    if (project.status === "RUNNING") return error("run_in_progress", "A pipeline run is already active.", 409);
    const roles = new Set(project.sourceAssets.map((asset) => asset.role));
    if (!roles.has("COVER_SOURCE") || !roles.has("MANUSCRIPT_SOURCE")) {
      return error("sources_incomplete", "One cover and one manuscript are required before running.", 409);
    }

    const now = new Date().toISOString();
    const runId = crypto.randomUUID();
    const stages = project.stages.map((stage) => {
      if (stage.name === "INTAKE" || stage.name === "SOURCE_VALIDATION") {
        return { ...stage, status: "SUCCEEDED", startedAt: now, completedAt: now };
      }
      if (stage.name === "MANUSCRIPT_EXTRACTION") {
        return { ...stage, status: "RUNNING", startedAt: now };
      }
      return { ...stage, status: "PENDING" };
    });

    const updated = {
      ...project,
      status: "RUNNING",
      stages,
      run: {
        id: runId,
        status: "RUNNING",
        currentStage: "MANUSCRIPT_EXTRACTION",
        startedAt: now,
        lastHeartbeatAt: now,
      },
      updatedAt: now,
    };
    await state.storage.put(key, updated);

    return json({
      status: "accepted",
      build: BUILD,
      run: updated.run,
      project: updated,
      safeguards: {
        liveShopifyMutation: "blocked",
        shopifyOutputStatus: "DRAFT",
        humanReviewRequired: true,
      },
    }, 202);
  }

  if (request.method === "GET" && action === "package") {
    const manifest = project.artifacts.find((artifact) => artifact.kind === "PACKAGE_MANIFEST");
    if (!manifest) return error("package_not_ready", "Deliverable package is not ready.", 404);
    return json({ status: "completed", build: BUILD, manifest, artifacts: project.artifacts });
  }

  return error("method_not_allowed", "Method not allowed for this publishing route.", 405);
}

function authorize(request, env) {
  const required = String(env.KAIROS_API_TOKEN || "").trim();
  if (!required) return null;
  const authorization = request.headers.get("Authorization") || "";
  if (authorization !== `Bearer ${required}`) {
    return error("unauthorized", "Valid Kairos bearer authorization is required.", 401);
  }
  return null;
}

function internalRequest(source, path, overrides = {}) {
  const headers = new Headers(source.headers);
  headers.delete("Authorization");
  for (const [name, value] of Object.entries(overrides.headers || {})) headers.set(name, value);
  return new Request(new URL(path, source.url), {
    method: overrides.method || source.method,
    headers,
    body: overrides.body !== undefined ? overrides.body : source.body,
  });
}

function validateAsset(role, mimeType, byteSize) {
  if (byteSize <= 0) return error("empty_asset", "Uploaded asset is empty.", 400);
  const allowed = role === "COVER_SOURCE" ? COVER_TYPES : MANUSCRIPT_TYPES;
  const max = role === "COVER_SOURCE" ? MAX_COVER_BYTES : MAX_MANUSCRIPT_BYTES;
  if (!allowed.has(mimeType)) return error("unsupported_mime_type", `Unsupported ${role} MIME type: ${mimeType}.`, 415);
  if (byteSize > max) return error("asset_too_large", `${role} exceeds the ${Math.floor(max / 1024 / 1024)} MB limit.`, 413);
  return null;
}

function sanitizeMetadata(value) {
  const input = value && typeof value === "object" ? value : {};
  const output = {};
  for (const key of ["workingTitle", "subtitle", "author", "productType", "intendedAudience", "notes"]) {
    if (typeof input[key] === "string" && input[key].trim()) output[key] = input[key].trim().slice(0, key === "notes" ? 4000 : 300);
  }
  return output;
}

function sanitizeFilename(value) {
  return String(value || "source.bin")
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180) || "source.bin";
}

function defaultFilename(role, mimeType) {
  const extensions = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
  };
  return `${role === "COVER_SOURCE" ? "cover" : "manuscript"}.${extensions[mimeType] || "bin"}`;
}

function normalizeMime(value) {
  return String(value || "application/octet-stream").split(";", 1)[0].trim().toLowerCase();
}

function isProjectId(value) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function readJSON(request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function error(code, message, status) {
  return json({ status: "failed", build: BUILD, error: { code, message } }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Publishing-Build": BUILD,
    },
  });
}
