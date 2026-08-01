export const KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD =
  "kairos-manuscript-package-state-20260731-3-bounded-recovery";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const DEDICATED_DEADLINE_MS = 2_500;
const LEGACY_DEADLINE_MS = 2_500;
const PUBLIC_ROUTE = /^\/api\/production-registry\/manuscripts\/([a-z0-9-]{8,})\/auto-pipeline$/i;
const INTERNAL_ROUTE = /^\/registry\/manuscripts\/([a-z0-9-]{8,})\/auto-pipeline$/i;

export async function handleManuscriptPackageState(request, env, ctx) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const match = url.pathname.match(PUBLIC_ROUTE);
  if (!match || request.method !== "GET") return null;

  const projectId = match[1];
  let dedicated;

  try {
    dedicated = await withDeadline(
      projectStub(env, projectId).fetch(
        `https://kairos.internal/registry/manuscripts/${encodeURIComponent(projectId)}/auto-pipeline`,
      ),
      DEDICATED_DEADLINE_MS,
      "dedicated manuscript package state",
    );
  } catch (error) {
    console.error("Kairos dedicated package-state shard timed out.", error);
    return stamp(
      retryableFailure(
        503,
        "package_state_shard_timeout",
        "The manuscript package-state shard did not respond in time.",
      ),
      "project-shard-timeout",
      startedAt,
    );
  }

  if (dedicated.status !== 404 && !dedicated.ok) {
    return stamp(dedicated, "project-shard-error", startedAt);
  }

  const dedicatedRecord = dedicated.ok
    ? await dedicated.clone().json().catch(() => null)
    : null;

  // The dedicated project shard is authoritative for the interactive read.
  // Legacy comparison is reconciliation work and must not block the UI.
  if (dedicatedRecord) {
    const reconciliation = reconcileLegacyInBackground(
      env,
      projectId,
      dedicatedRecord,
    ).catch(error => {
      console.error(
        "Kairos package-state background reconciliation failed.",
        error,
      );
    });

    if (typeof ctx?.waitUntil === "function") {
      ctx.waitUntil(reconciliation);
    } else {
      void reconciliation;
    }

    return stamp(dedicated, "project-shard", startedAt);
  }

  let legacy;
  try {
    legacy = await withDeadline(
      legacyRecord(env, projectId),
      LEGACY_DEADLINE_MS,
      "legacy manuscript package state",
    );
  } catch (error) {
    console.error("Kairos legacy package-state recovery timed out.", error);
    return stamp(
      retryableFailure(
        503,
        "package_state_recovery_timeout",
        "Kairos could not complete legacy package-state recovery in time.",
      ),
      "legacy-recovery-timeout",
      startedAt,
    );
  }

  if (!legacy) {
    return stamp(dedicated, "not-started", startedAt);
  }

  try {
    await withDeadline(
      storeRecord(env, projectId, legacy),
      LEGACY_DEADLINE_MS,
      "legacy package-state migration",
    );
    return stamp(json(legacy), "legacy-migrated", startedAt);
  } catch (error) {
    console.error(
      "Kairos recovered the publishing package but could not reconcile it into the manuscript project shard immediately.",
      error,
    );
    return stamp(json(legacy), "legacy-fallback", startedAt);
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

async function reconcileLegacyInBackground(env, projectId, dedicatedRecord) {
  const legacy = await withDeadline(
    legacyRecord(env, projectId),
    LEGACY_DEADLINE_MS,
    "background legacy package state",
  );

  if (legacy && isNewerRecord(legacy, dedicatedRecord)) {
    await withDeadline(
      storeRecord(env, projectId, legacy),
      LEGACY_DEADLINE_MS,
      "background package-state storage",
    );
  }
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

function isNewerRecord(candidate, current) {
  const candidateTime = recordTime(candidate);
  const currentTime = recordTime(current);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  if (candidate?.packageApproval?.approved && !current?.packageApproval?.approved) return true;
  if (statusRank(candidate?.status) !== statusRank(current?.status)) {
    return statusRank(candidate?.status) > statusRank(current?.status);
  }
  return false;
}

function recordTime(record) {
  const value = Date.parse(String(record?.updatedAt || record?.createdAt || ""));
  return Number.isFinite(value) ? value : 0;
}

function statusRank(status) {
  return ({
    "production-ready": 1,
    "package-approved": 2,
  })[String(status || "")] || 0;
}

function stamp(response, state, startedAt = Date.now()) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kairos-Package-State", state);
  headers.set("X-Kairos-Package-State-Build", KAIROS_MANUSCRIPT_PACKAGE_STATE_BUILD);
  headers.set(
    "Server-Timing",
    `package_state;dur=${Math.max(0, Date.now() - startedAt)}`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function retryableFailure(status, code, message) {
  const response = failure(status, code, message);
  const headers = new Headers(response.headers);
  headers.set("Retry-After", "1");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function withDeadline(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} exceeded ${milliseconds} ms.`);
          error.code = "KAIROS_INTERNAL_DEADLINE";
          reject(error);
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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
