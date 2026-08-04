import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const bridgeSource = await readFile(
  new URL("../../../web/kairos-dashboard/scripts/manuscript-project-preservation-bridge.js", import.meta.url),
  "utf8",
);

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function createRuntime({ href, session = {}, local = {}, projects, sourceProjectId, publicProjectId }) {
  const calls = [];
  const location = { href };
  const history = {
    state: null,
    replaceState(nextState, _title, nextHref) {
      this.state = nextState;
      location.href = String(nextHref);
    },
  };
  const sessionStorage = new MemoryStorage(session);
  const localStorage = new MemoryStorage(local);

  const nativeFetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url || String(input), location.href);
    const method = String(init.method || request?.method || "GET").toUpperCase();
    calls.push({ method, pathname: url.pathname });

    if (url.pathname === "/api/production-registry/projects") {
      return Response.json({ projects });
    }
    if (url.pathname === `/api/production-registry/manuscripts/${sourceProjectId}/source/text`) {
      return Response.json({
        projectId: sourceProjectId,
        manuscript: "RESTORED CANONICAL MANUSCRIPT",
        source: { filename: "customer-source.docx", projectId: sourceProjectId },
      });
    }
    if (url.pathname === `/api/production-registry/manuscripts/${sourceProjectId}/deliverables/build`) {
      return Response.json({ status: "completed", projectId: sourceProjectId }, { status: 201 });
    }
    if (url.pathname.includes(publicProjectId)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ error: "unexpected", pathname: url.pathname }, { status: 404 });
  };

  const sandbox = {
    AbortController,
    CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    Headers,
    Request,
    Response,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: nativeFetch,
    history,
    localStorage,
    location,
    sessionStorage,
    setTimeout,
  };
  sandbox.window = sandbox;
  sandbox.dispatchEvent = () => true;
  sandbox.addEventListener = () => {};
  vm.createContext(sandbox);
  vm.runInContext(bridgeSource, sandbox, { filename: "manuscript-project-preservation-bridge.js" });

  return { sandbox, calls, location, sessionStorage, localStorage };
}

function projectFixture() {
  return {
    projectId: "PUB-01e16d4e",
    projectID: "PUB-01e16d4e",
    sourceProjectId: "manuscript-studio-source-7",
    intakeId: "INT-1e64523f",
    projectType: "manuscript-studio",
    title: "AI Video Prompt Mastery",
    status: "packaged",
    stage: "manufacturing",
    updatedAt: "2026-08-04T20:00:00.000Z",
  };
}

test("public manuscript project reconnects to its canonical source Durable Object identity", async () => {
  const project = projectFixture();
  const runtime = createRuntime({
    href: "https://kairos.test/manuscript?open=manuscript&project=PUB-01e16d4e",
    projects: [project],
    sourceProjectId: project.sourceProjectId,
    publicProjectId: project.projectId,
  });

  await runtime.sandbox.KairosManuscriptProjectIdentity.readyPromise;

  const active = JSON.parse(runtime.sessionStorage.getItem("kairos.production.active-workspace"));
  assert.equal(active.projectId, project.sourceProjectId);
  assert.equal(active.sourceProjectId, project.sourceProjectId);
  assert.equal(active.registryProjectId, project.projectId);
  assert.equal(active.intakeId, project.intakeId);
  assert.equal(new URL(runtime.location.href).searchParams.get("project"), project.sourceProjectId);
  assert.equal(new URL(runtime.location.href).searchParams.get("registryProject"), project.projectId);

  const response = await runtime.sandbox.fetch(
    `/api/production-registry/manuscripts/${project.projectId}/deliverables/build`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "MANUFACTURE DELIVERY PACKAGE" }),
    },
  );
  assert.equal(response.status, 201);
  assert.ok(runtime.calls.some(call => call.pathname === `/api/production-registry/manuscripts/${project.sourceProjectId}/deliverables/build`));
  assert.ok(!runtime.calls.some(call => call.pathname === `/api/production-registry/manuscripts/${project.projectId}/deliverables/build`));
});

test("missing tab session restores the latest saved manuscript identity instead of creating a new random project", async () => {
  const project = projectFixture();
  const runtime = createRuntime({
    href: "https://kairos.test/manuscript?open=manuscript",
    projects: [project],
    sourceProjectId: project.sourceProjectId,
    publicProjectId: project.projectId,
  });

  await runtime.sandbox.KairosManuscriptProjectIdentity.readyPromise;

  const active = JSON.parse(runtime.sessionStorage.getItem("kairos.production.active-workspace"));
  assert.equal(active.projectId, project.sourceProjectId);
  assert.doesNotMatch(active.projectId, /^manuscript-studio-[0-9a-f-]{36}$/i);
  const persisted = JSON.parse(runtime.localStorage.getItem("kairos.manuscript.last-resolved-identity.v1"));
  assert.equal(persisted.canonicalProjectId, project.sourceProjectId);
  assert.ok(runtime.sandbox.__KAIROS_MANUSCRIPT_RESTORED_SOURCE__?.manuscript.includes("RESTORED CANONICAL"));
});

test("projectID and intakeID casing aliases resolve without losing the source project", async () => {
  const project = {
    ...projectFixture(),
    projectId: undefined,
    projectID: "PUB-case-alias",
    intakeId: undefined,
    intakeID: "INT-case-alias",
  };
  const runtime = createRuntime({
    href: "https://kairos.test/manuscript?open=manuscript&project=PUB-case-alias",
    projects: [project],
    sourceProjectId: project.sourceProjectId,
    publicProjectId: "PUB-case-alias",
  });

  await runtime.sandbox.KairosManuscriptProjectIdentity.readyPromise;
  const active = JSON.parse(runtime.sessionStorage.getItem("kairos.production.active-workspace"));
  assert.equal(active.projectId, project.sourceProjectId);
  assert.equal(active.registryProjectId, "PUB-case-alias");
  assert.equal(active.intakeId, "INT-case-alias");
});
