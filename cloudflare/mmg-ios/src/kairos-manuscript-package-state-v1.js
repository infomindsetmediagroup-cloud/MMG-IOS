export const KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD = "kairos-manuscript-package-state-20260731-1";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const PUBLIC_ROUTE = /^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/auto-pipeline$/i;
const INTERNAL_ROUTE = /^\/registry\/manuscripts\/([a-z0-9-]{8,})\/auto-pipeline$/i;

export async function handleManuscriptPackageState(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(PUBLIC_ROUTE);
  if (!match || request.method !== "GET") return null;

  const projectId = match[1];
  const dedicated = await projectStub(env, projectId).fetch(
    `https://kairos.internal/registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`,
  );

  if (dedicated.ok || dedicated.status !== 404) {
    return stamp(dedicated, dedicated.ok ? "project-shard" : "project-shard-error");
  }

  const legacy = await legacyRecord(env, projectId);
  if (!legacy) return stamp(dedicated, "not-started");

  try {
    await storeRecord(env, projectId, legacy);
    return stamp(json(legacy), "legacy-migrated");
  } catch (error) {
    console.error("Kairos recovered the publishing package but could not migrate it into the manuscript project shard immediately.", error);
    return stamp(json(legacy), "legacy-fallback");
  }
}

export async function handleManuscriptPackageStateObjectRequest(state, request) {
  const url = new URL(request.url);
  const match = url.pathname.match(INTERNAL_ROUTE);
  if (!match) return null;

  const projectId = match[1];
  const key = `manuscript:${projectId}:auto-pipeline`;

  if (request.method === "GET") {
    const record = await state.storage.get(key);
    return record
      ? json(record)
      : failure(404, "auto_pipeline_not_started", "Kairos has not built the production package yet.");
  }

  if (request.method === "PUT") {
    const record = await request.json().catch(() => null);
    if (!record || String(record.projectId || "") !== projectId) {
      return failure(400, "package_record_invalid", "The publishing package record does not match this manuscript project.");
    }
    await state.storage.put(key, record);
    return json(record, 201);
  }

  return failure(405, "package_state_method_not_allowed", "This package-state method is not allowed.");
}

async function legacyRecord(env, projectId) {
  if (!env?.KAIROS_PROJECTS?.idFromName || !env?.KAIROS_PROJECTS?.get) return null;
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  const response = await stub.fetch(
    `https://kairos.internal/registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`,
  );
  return response.ok ? response.json().catch(() => null) : null;
}

async function storeRecord(env, projectId, record) {
  const response = await projectStub(env, projectId).fetch(
    `https://kairos.internal/registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    },
  );
  if (!response.ok) throw new Error("The publishing package record could not be stored in the manuscript project shard.");
}

function projectStub(env, projectId) {
  if (!env?.KAIROS_MANUSCRIPT_SOURCES?.idFromName || !env?.KAIROS_MANUSCRIPT_SOURCES?.get) {
    throw Object.assign(new Error("The dedicated manuscript project runtime is not configured."), { status: 503 });
  }
  return env.KAIROS_MANUSCRIPT_SOURCES.get(env.KAIROS_MANUSCRIPT_SOURCES.idFromName(projectId));
}

function stamp(response, state) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Package-State", state);
  headers.set("X-Kairos-Package-State-Build", KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function failure(status, code, message) {
  return json({ status: "failed", build: KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD, error: { code, message } }, status);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Kairos-Package-State-Build": KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD,
    },
  });
}
