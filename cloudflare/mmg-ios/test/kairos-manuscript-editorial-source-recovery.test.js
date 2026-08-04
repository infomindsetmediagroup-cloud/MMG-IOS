import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../../../web/kairos-dashboard/scripts/manuscript-deadlock-recovery.js", import.meta.url),
  "utf8",
);

class MemoryStorage {
  constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class MutationObserverStub {
  constructor(callback) { this.callback = callback; }
  observe() {}
  disconnect() {}
}

function createRuntime({ session = {}, local = {}, nativeFetch }) {
  const sessionStorage = new MemoryStorage(session);
  const localStorage = new MemoryStorage(local);
  const document = {
    documentElement: {},
    visibilityState: "visible",
    addEventListener() {},
    querySelector() { return null; },
  };
  const sandbox = {
    AbortController,
    Date,
    Element: class Element {},
    Headers,
    MutationObserver: MutationObserverStub,
    Request,
    Response,
    URL,
    clearTimeout,
    console,
    document,
    fetch: nativeFetch,
    localStorage,
    location: { href: "https://kairos.test/manuscript?open=manuscript&project=PUB-project" },
    queueMicrotask,
    sessionStorage,
    setTimeout,
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.KairosManuscriptProjectIdentity = {
    snapshot() {
      return {
        identity: {
          canonicalProjectId: "source-project",
          sourceProjectId: "source-project",
          registryProjectId: "PUB-project",
          aliases: ["source-project", "PUB-project"],
        },
      };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "manuscript-deadlock-recovery.js" });
  return { sandbox, sessionStorage, localStorage };
}

test("missing source text is reconstructed from the saved final editorial version", async () => {
  const calls = [];
  const manuscript = "This is the checksum-verified final editorial manuscript. ".repeat(5);
  const runtime = createRuntime({
    session: {
      "kairos.production.active-workspace": JSON.stringify({
        workspace: "manuscript-studio",
        projectId: "source-project",
        registryProjectId: "PUB-project",
      }),
    },
    nativeFetch: async input => {
      const url = new URL(input instanceof Request ? input.url : String(input), "https://kairos.test");
      calls.push(url.pathname);
      if (url.pathname.endsWith("/source/text")) {
        return Response.json({ status: "not-found" }, { status: 404 });
      }
      if (url.pathname === "/api/production-registry/manuscripts/source-project/editorial") {
        return Response.json({
          editorial: {
            status: "ready-for-manufacturing",
            finalVersionId: "version-final",
            versions: [{ versionId: "version-final", checksum: "abc123" }],
          },
        });
      }
      if (url.pathname === "/api/production-registry/manuscripts/source-project/editorial/versions/version-final") {
        return Response.json({ manuscript, checksum: "abc123" });
      }
      if (url.pathname === "/api/production-registry/manuscripts/source-project/source") {
        return Response.json({ source: { filename: "customer-source.docx" } });
      }
      return Response.json({ status: "not-found" }, { status: 404 });
    },
  });

  const response = await runtime.sandbox.fetch(
    "/api/production-registry/manuscripts/PUB-project/source/text",
    { method: "GET" },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.manuscript, manuscript);
  assert.equal(body.projectId, "source-project");
  assert.equal(body.manuscriptAuthority, "checksum-verified-editorial-version");
  assert.equal(body.recovery.versionId, "version-final");
  assert.equal(body.source.filename, "customer-source.docx");
  assert.ok(calls.includes("/api/production-registry/manuscripts/source-project/editorial"));
  assert.ok(calls.includes("/api/production-registry/manuscripts/source-project/editorial/versions/version-final"));
  const snapshot = runtime.sandbox.KairosManuscriptDeadlockRecovery.snapshot();
  assert.equal(snapshot.recoveredSourceFromEditorial, 1);
  assert.equal(snapshot.lastSourceRecovery, "checksum-verified-editorial-version");
});

test("browser-retained manuscript is used before another durable editorial read", async () => {
  const manuscript = "This browser-retained manuscript remains tied to the saved project. ".repeat(4);
  const calls = [];
  const runtime = createRuntime({
    session: {
      "kairos.production.active-workspace": JSON.stringify({
        workspace: "manuscript-studio",
        projectId: "source-project",
      }),
      "kairos.manuscript-studio.recoverable-draft.v1": JSON.stringify({
        projectId: "source-project",
        manuscript,
        source: { filename: "retained-source.docx" },
      }),
    },
    nativeFetch: async input => {
      const url = new URL(input instanceof Request ? input.url : String(input), "https://kairos.test");
      calls.push(url.pathname);
      return Response.json({ status: "not-found" }, { status: 404 });
    },
  });

  const response = await runtime.sandbox.fetch(
    "/api/production-registry/manuscripts/source-project/source/text",
    { method: "GET" },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.manuscript, manuscript);
  assert.equal(body.manuscriptAuthority, "browser-retained-source");
  assert.equal(body.recovery.recoveredFrom, "session-draft");
  assert.deepEqual(calls, ["/api/production-registry/manuscripts/source-project/source/text"]);
  const snapshot = runtime.sandbox.KairosManuscriptDeadlockRecovery.snapshot();
  assert.equal(snapshot.recoveredSourceFromBrowser, 1);
});
