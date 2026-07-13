import runtime, { KairosProject } from "./kairos-production-entry-v13.js";
import {
  executeWebsiteRetoolExceptions,
  rollbackWebsiteRetoolExceptions,
} from "./kairos-website-retool-exception-executor-v1.js";

const BUILD = "kairos-production-entry-20260713-14";
const EXECUTE_PATH = "/api/shopify/website-retool/exceptions/execute";
const ROLLBACK_PATH = "/api/shopify/website-retool/exceptions/rollback";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === EXECUTE_PATH) {
      try {
        const payload = await safeJSON(request.clone());
        const result = await executeWebsiteRetoolExceptions(request, env, payload);
        return json({ status: "completed", build: BUILD, result });
      } catch (error) {
        return failure("website_retool_exception_execution_failed", error);
      }
    }

    if (request.method === "POST" && url.pathname === ROLLBACK_PATH) {
      try {
        const payload = await safeJSON(request.clone());
        const result = await rollbackWebsiteRetoolExceptions(request, env, payload);
        return json({ status: "completed", build: BUILD, result });
      } catch (error) {
        return failure("website_retool_exception_rollback_failed", error);
      }
    }

    const response = await runtime.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Website-Retool", "governed-execution-v1");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
      message: error instanceof Error ? error.message : "Website retool execution failed.",
    },
    safeguards: {
      stagingOnly: true,
      liveThemeChanged: false,
      sourceHashBound: true,
      exactPathMutationOnly: true,
    },
  }, 409);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Website-Retool": "governed-execution-v1",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
