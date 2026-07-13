import runtime, { KairosProject } from "./kairos-production-entry-v6.js";
import { restoreApprovedHomepageBaseline } from "./kairos-approved-baseline-restore-v1.js";

const BUILD = "kairos-production-entry-20260713-7";
const PLAN_PATH = "/api/shopify/staging/plan/jobs";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== PLAN_PATH) {
      return stamp(await runtime.fetch(request, env, ctx));
    }

    const bodyText = await request.text();
    const first = await runtime.fetch(cloneRequest(request, bodyText), env, ctx);
    if (first.status !== 409) return stamp(first);

    const failure = await readJSON(first.clone());
    if (failure?.error?.code !== "patch_only_source_required") return stamp(first);

    try {
      const restored = await restoreApprovedHomepageBaseline(env);
      const retry = await runtime.fetch(cloneRequest(request, bodyText), env, ctx);
      const headers = new Headers(retry.headers);
      headers.set("X-MMG-Runtime-Guard", BUILD);
      headers.set("X-Kairos-Baseline-Restored", "verified");
      headers.set("X-Kairos-Baseline-Source", restored.sourceTheme?.name || "MAIN");
      headers.set("Cache-Control", "no-store");
      return new Response(retry.body, { status: retry.status, statusText: retry.statusText, headers });
    } catch (error) {
      return new Response(JSON.stringify({
        status: "needs-attention",
        build: BUILD,
        error: {
          code: "approved_baseline_restore_failed",
          message: error instanceof Error ? error.message : "Kairos could not restore the approved homepage baseline to staging.",
        },
        safeguards: { liveThemeChanged: false, stagingOnly: true, patchOnly: true },
      }), {
        status: 409,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-MMG-Runtime-Guard": BUILD,
          "X-Kairos-Visual-Lock": "patch-only",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  },
};

function cloneRequest(request, bodyText) {
  return new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: bodyText,
    redirect: request.redirect,
  });
}

async function readJSON(response) { try { return await response.json(); } catch { return {}; } }

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime-Guard", BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
