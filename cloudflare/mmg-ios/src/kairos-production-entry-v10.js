import runtime, { KairosProject } from "./kairos-production-entry-v9.js";
import {
  decideLifecycleReview,
  executeApprovedLifecycleReview,
  prepareLifecycleReview,
} from "./kairos-link-lifecycle-review-v1.js";

const BUILD = "kairos-production-entry-20260713-10";
const PREPARE_REVIEW_PATH = "/api/shopify/link-intelligence/review/prepare";
const DECIDE_REVIEW_PATH = "/api/shopify/link-intelligence/review/decide";
const EXECUTE_REVIEW_PATH = "/api/shopify/link-intelligence/review/execute";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === PREPARE_REVIEW_PATH) {
      try {
        const review = await prepareLifecycleReview(request, env);
        return json({ status: "completed", build: BUILD, review });
      } catch (error) {
        return failure("lifecycle_review_prepare_failed", error);
      }
    }

    if (request.method === "POST" && url.pathname === DECIDE_REVIEW_PATH) {
      try {
        const payload = await safeJSON(request.clone());
        const review = await decideLifecycleReview(request, payload);
        return json({ status: "completed", build: BUILD, review });
      } catch (error) {
        return failure("lifecycle_review_decision_failed", error);
      }
    }

    if (request.method === "POST" && url.pathname === EXECUTE_REVIEW_PATH) {
      try {
        const payload = await safeJSON(request.clone());
        const result = await executeApprovedLifecycleReview(request, env, payload);
        return json({ status: "completed", build: BUILD, result });
      } catch (error) {
        return failure("lifecycle_review_execute_failed", error);
      }
    }

    return stamp(await runtime.fetch(request, env, ctx));
  },
};

async function safeJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

function failure(code, error) {
  return json({
    status: "failed",
    build: BUILD,
    error: {
      code,
      message: error instanceof Error ? error.message : "Kairos lifecycle review failed.",
    },
    safeguards: {
      stagingOnly: true,
      liveThemeChanged: false,
      visualStructureLocked: true,
    },
  }, 409);
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Link-Intelligence", "executive-review-v1");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Link-Intelligence": "executive-review-v1",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
