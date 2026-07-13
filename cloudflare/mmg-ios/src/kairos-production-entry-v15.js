import runtime, { KairosProject } from "./kairos-production-entry-v14.js";
import {
  readLatestWebsiteIntelligenceReport,
  runWebsiteIntelligenceSupervisor,
} from "./kairos-website-intelligence-supervisor-v1.js";

const BUILD = "kairos-production-entry-20260713-15";
const RUN_PATH = "/api/shopify/website-intelligence/run";
const LATEST_PATH = "/api/shopify/website-intelligence/latest";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === RUN_PATH) {
      try {
        const report = await runWebsiteIntelligenceSupervisor(request, env, "manual");
        return json({ status: "completed", build: BUILD, report });
      } catch (error) {
        return failure("website_intelligence_run_failed", error);
      }
    }

    if (request.method === "GET" && url.pathname === LATEST_PATH) {
      const report = await readLatestWebsiteIntelligenceReport(request);
      return report
        ? json({ status: "completed", build: BUILD, report })
        : json({ status: "not-ready", build: BUILD, message: "No website review has been completed yet." }, 404);
    }

    return stamp(await runtime.fetch(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    const request = new Request("https://kairos.internal/api/shopify/website-intelligence/run", { method: "POST" });
    ctx.waitUntil(runWebsiteIntelligenceSupervisor(request, env, `scheduled:${controller.cron}`));
  },
};

function failure(code, error) {
  return json({
    status: "failed",
    build: BUILD,
    error: { code, message: error instanceof Error ? error.message : "Website intelligence failed." },
    safeguards: { liveMutationPerformed: false, stagingMutationPerformed: false },
  }, 502);
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Runtime", BUILD);
  headers.set("X-Kairos-Website-Intelligence", "supervisor-v1");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Website-Intelligence": "supervisor-v1",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
