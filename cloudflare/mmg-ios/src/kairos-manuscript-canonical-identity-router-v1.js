export const KAIROS_MANUSCRIPT_CANONICAL_IDENTITY_BUILD =
  "kairos-manuscript-canonical-identity-20260804-1-server-shard-resolution";

const REGISTRY_OBJECT = "mmg-production-project-registry";
const MANUSCRIPT_ROUTE = /^\/api\/production-registry\/manuscripts\/([^/]+)(\/.*)?$/i;
const REGISTRY_DEADLINE_MS = 2_500;
const PROBE_DEADLINE_MS = 1_500;
const MAX_CANDIDATES = 24;

export async function resolveCanonicalManuscriptRequest(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(MANUSCRIPT_ROUTE);
  if (!match) return unresolved(request, "not-manuscript-route");

  const requestedProjectId = decodeURIComponent(match[1]);
  if (!hasBindings(env)) return unresolved(request, "bindings-unavailable", requestedProjectId);

  const projects = await readProjects(env).catch(() => []);
  const matchingProjects = projects.filter(project =>
    aliasesFor(project).some(alias => sameId(alias, requestedProjectId))
  );
  const candidates = unique([
    requestedProjectId,
    ...matchingProjects.flatMap(preferredProjectIds),
  ]).slice(0, MAX_CANDIDATES);

  const suffix = match[2] || "";
  const canonicalProjectId = await selectExistingShard(env, candidates, suffix);
  if (!canonicalProjectId || sameId(canonicalProjectId, requestedProjectId)) {
    return unresolved(
      request,
      canonicalProjectId ? "requested-shard-authoritative" : "canonical-shard-not-found",
      requestedProjectId,
    );
  }

  const nextURL = new URL(url.href);
  nextURL.pathname = `/api/production-registry/manuscripts/${encodeURIComponent(canonicalProjectId)}${suffix}`;
  const headers = new Headers(request.headers);
  headers.set("X-Kairos-Manuscript-Identity-Build", KAIROS_MANUSCRIPT_CANONICAL_IDENTITY_BUILD);
  headers.set("X-Kairos-Requested-Manuscript-Project", requestedProjectId);
  headers.set("X-Kairos-Canonical-Manuscript-Project", canonicalProjectId);

  return {
    request: rebuildRequest(request, nextURL.href, headers),
    resolved: true,
    requestedProjectId,
    canonicalProjectId,
    aliases: candidates,
    source: "global-registry-and-shard-probe",
    build: KAIROS_MANUSCRIPT_CANONICAL_IDENTITY_BUILD,
  };
}

async function readProjects(env) {
  const stub = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(REGISTRY_OBJECT));
  const response = await withDeadline(
    stub.fetch(new Request("https://kairos.internal/registry/projects", {
      method: "GET",
      headers: {
        "Cache-Control": "no-store",
        "X-Kairos-Manuscript-Identity-Build": KAIROS_MANUSCRIPT_CANONICAL_IDENTITY_BUILD,
      },
    })),
    REGISTRY_DEADLINE_MS,
  );
  if (!response.ok) return [];
  const body = await withDeadline(response.json().catch(() => ({})), REGISTRY_DEADLINE_MS);
  if (Array.isArray(body?.projects)) return body.projects;
  if (Array.isArray(body?.records)) return body.records;
  if (body?.projects && typeof body.projects === "object") return Object.values(body.projects);
  if (body?.records && typeof body.records === "object") return Object.values(body.records);
  return [];
}

async function selectExistingShard(env, candidates, requestedSuffix) {
  let best = null;
  for (const candidate of candidates) {
    const score = await probeShard(env, candidate, requestedSuffix);
    if (!score) continue;
    if (!best || score > best.score) best = { projectId: candidate, score };
    if (score >= 100) break;
  }
  return best?.projectId || "";
}

async function probeShard(env, projectId, requestedSuffix) {
  const stub = env.KAIROS_MANUSCRIPT_SOURCES.get(
    env.KAIROS_MANUSCRIPT_SOURCES.idFromName(projectId),
  );
  const probes = probePaths(projectId, requestedSuffix);
  let score = 0;

  for (const probe of probes) {
    try {
      const response = await withDeadline(
        stub.fetch(new Request(`https://kairos.internal${probe.path}`, {
          method: "GET",
          headers: {
            "Cache-Control": "no-store",
            "X-Kairos-Manuscript-Identity-Probe": probe.name,
            "X-Kairos-Manuscript-Identity-Build": KAIROS_MANUSCRIPT_CANONICAL_IDENTITY_BUILD,
          },
        })),
        PROBE_DEADLINE_MS,
      );
      if (response.ok) score = Math.max(score, probe.score);
    } catch {
      // A failed candidate probe must not block the remaining authoritative aliases.
    }
  }

  return score;
}

function probePaths(projectId, requestedSuffix) {
  const base = `/registry/manuscripts/${encodeURIComponent(projectId)}`;
  const preferred = requestedSuffix.startsWith("/auto-pipeline")
    ? [{ name: "requested-package-state", path: `${base}/auto-pipeline`, score: 120 }]
    : requestedSuffix.startsWith("/source")
      ? [{ name: "requested-source", path: `${base}/source/text`, score: 120 }]
      : requestedSuffix.startsWith("/editorial")
        ? [{ name: "requested-editorial", path: `${base}/editorial`, score: 120 }]
        : requestedSuffix.startsWith("/setup")
          ? [{ name: "requested-setup", path: `${base}/setup`, score: 120 }]
          : [];

  return dedupeProbes([
    ...preferred,
    { name: "durable-source", path: `${base}/source/text`, score: 100 },
    { name: "editorial-state", path: `${base}/editorial`, score: 90 },
    { name: "project-setup", path: `${base}/setup`, score: 80 },
    { name: "package-state", path: `${base}/auto-pipeline`, score: 70 },
  ]);
}

function preferredProjectIds(project) {
  return unique([
    project?.canonicalProjectId,
    project?.sourceProjectId,
    project?.sourceReleaseId,
    project?.manuscriptProjectId,
    project?.internalProjectId,
    project?.registryProjectId,
    project?.projectId,
    project?.projectID,
    project?.id,
    project?.publicProjectId,
    project?.intakeId,
    project?.intakeID,
    project?.source?.projectId,
    project?.setup?.projectId,
    project?.editorial?.projectId,
    ...idsFromURLs(project),
    ...(Array.isArray(project?.aliases) ? project.aliases : []),
  ]);
}

function aliasesFor(project) {
  return preferredProjectIds(project);
}

function idsFromURLs(project) {
  const values = [
    project?.source?.sourceDownloadURL,
    project?.source?.extractedTextURL,
    project?.sourceDownloadURL,
    project?.extractedTextURL,
  ];
  const ids = [];
  for (const value of values) {
    const match = String(value || "").match(/\/manuscripts\/([^/]+)/i);
    if (match?.[1]) ids.push(decodeURIComponent(match[1]));
  }
  return ids;
}

function rebuildRequest(request, href, headers) {
  const rewritten = new Request(href, request.clone());
  return new Request(rewritten, { headers });
}

function unresolved(request, source, requestedProjectId = "") {
  return {
    request,
    resolved: false,
    requestedProjectId,
    canonicalProjectId: requestedProjectId,
    aliases: requestedProjectId ? [requestedProjectId] : [],
    source,
    build: KAIROS_MANUSCRIPT_CANONICAL_IDENTITY_BUILD,
  };
}

function hasBindings(env) {
  return Boolean(
    env?.KAIROS_PROJECTS?.idFromName &&
    env?.KAIROS_PROJECTS?.get &&
    env?.KAIROS_MANUSCRIPT_SOURCES?.idFromName &&
    env?.KAIROS_MANUSCRIPT_SOURCES?.get
  );
}

function dedupeProbes(probes) {
  const seen = new Set();
  return probes.filter(probe => {
    if (seen.has(probe.path)) return false;
    seen.add(probe.path);
    return true;
  });
}

function sameId(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

async function withDeadline(promise, milliseconds) {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Canonical manuscript identity lookup timed out.")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
