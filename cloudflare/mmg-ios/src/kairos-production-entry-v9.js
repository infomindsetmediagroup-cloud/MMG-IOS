import runtime, { KairosProject } from "./kairos-production-entry-v8.js";
import {
  executeHomepageLinkRepair,
  prepareHomepageLinkRepair,
} from "./kairos-link-lifecycle-repair-v2.js";

const BUILD = "kairos-production-entry-20260713-9";
const PREPARE_PATH = "/api/shopify/link-intelligence/repair/prepare";
const EXECUTE_PATH = "/api/shopify/link-intelligence/repair/execute";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === PREPARE_PATH) {
      try {
        const plan = await prepareHomepageLinkRepair(request, env);
        return json({ status: "completed", build: BUILD, plan }, 200);
      } catch (error) {
        return failure("link_repair_prepare_failed", error);
      }
    }

    if (request.method === "POST" && url.pathname === EXECUTE_PATH) {
      try {
        const payload = await safeJSON(request.clone());
        const result = await executeHomepageLinkRepair(request, env, payload);
        return json({ status: "completed", build: BUILD, result }, 200);
      } catch (error) {
        return failure("link_repair_execute_failed", error);
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
      message: error instanceof Error ? error.message : "Kairos link repair failed.",
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
  headers.set("X-Kairos-Link-Intelligence", "governed-repair-v2");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Link-Intelligence": "governed-repair-v2",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
