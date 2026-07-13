import runtime, { KairosProject } from "./kairos-production-entry-v12.js";
import { prepareWebsiteRetoolExceptions } from "./kairos-website-retool-exception-planner-v1.js";

const BUILD = "kairos-production-entry-20260713-13";
const PREPARE_PATH = "/api/shopify/website-retool/exceptions/prepare";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === PREPARE_PATH) {
      try {
        const plan = await prepareWebsiteRetoolExceptions(request, env);
        return json({ status: "completed", build: BUILD, plan });
      } catch (error) {
        return json({
          status: "failed",
          build: BUILD,
          error: {
            code: "website_retool_exception_plan_failed",
            message: error instanceof Error ? error.message : "Website retool exception planning failed.",
          },
          safeguards: { stagingOnly: true, mutationPerformed: false, liveThemeChanged: false },
        }, 409);
      }
    }

    const response = await runtime.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Website-Retool", "schema-bound-exception-planning-v1");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Website-Retool": "schema-bound-exception-planning-v1",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
