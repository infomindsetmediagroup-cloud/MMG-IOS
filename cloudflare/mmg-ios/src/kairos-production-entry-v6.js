import runtime, { KairosProject } from "./kairos-production-entry-v4.js";

const BUILD = "kairos-production-entry-20260713-6";
const PLAN_PATH = "/api/shopify/staging/plan/jobs";
const EXECUTE_PATH = "/api/shopify/staging/execute/jobs";
const CANONICAL_PREFIX = "kairos-canonical-homepage";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === PLAN_PATH) {
      return enforcePatchOnlyPlan(request, env, ctx);
    }

    if (request.method === "POST" && url.pathname === EXECUTE_PATH) {
      const payload = await safeJSON(request.clone());
      const mode = String(payload?.plan?.plan?.installationMode || "");
      if (mode.startsWith(CANONICAL_PREFIX)) {
        return blocked(
          "visual_replacement_forbidden",
          "Kairos blocked this execution because it would replace the approved homepage structure or styling. Create a new patch-only plan that edits existing settings without installing the canonical homepage package."
        );
      }
    }

    const response = await runtime.fetch(request, env, ctx);
    return withBuild(response);
  },
};

async function enforcePatchOnlyPlan(request, env, ctx) {
  const original = await runtime.fetch(request, env, ctx);
  if (!original.ok && original.status !== 202) return withBuild(original);

  const submitted = await safeJSON(original.clone());
  const pollURL = String(submitted?.pollURL || "");
  if (!pollURL) return withBuild(original);

  const pollRequest = new Request(new URL(pollURL, request.url).toString(), {
    method: "GET",
    headers: request.headers,
  });
  const completedResponse = await runtime.fetch(pollRequest, env, ctx);
  const completed = await safeJSON(completedResponse.clone());
  const mode = String(completed?.result?.plan?.installationMode || "");

  if (mode.startsWith(CANONICAL_PREFIX)) {
    return blocked(
      "patch_only_source_required",
      "The current staging source does not expose a safe existing-settings patch. Kairos will not install a replacement homepage. Restore the approved homepage baseline on Kairos Staging, then generate a new patch-only plan."
    );
  }

  return withBuild(original);
}

async function safeJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function blocked(code, message) {
  return new Response(JSON.stringify({
    status: "blocked",
    build: BUILD,
    error: { code, message },
    safeguards: {
      patchOnly: true,
      canonicalHomepageInstaller: "blocked",
      visualStructureMutation: "blocked",
      liveThemeMutation: "blocked",
    },
  }), {
    status: 409,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Visual-Lock": "patch-only",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function withBuild(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime-Guard", BUILD);
  headers.set("X-Kairos-Visual-Lock", "patch-only");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
