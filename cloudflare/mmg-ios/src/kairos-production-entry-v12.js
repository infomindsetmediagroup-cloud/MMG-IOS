import runtime, { KairosProject } from "./kairos-production-entry-v11.js";
import { inspectWebsiteRetoolSchema } from "./kairos-website-retool-schema-inspector-v1.js";

const BUILD = "kairos-production-entry-20260713-12";
const INSPECT_PATH = "/api/shopify/website-retool/schema-inspection";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === INSPECT_PATH) {
      try {
        const report = await inspectWebsiteRetoolSchema(request, env);
        return json({ status: "completed", build: BUILD, report });
      } catch (error) {
        return json({
          status: "failed",
          build: BUILD,
          error: {
            code: "website_retool_schema_inspection_failed",
            message: error instanceof Error ? error.message : "Website retool schema inspection failed.",
          },
          safeguards: { readOnly: true, liveThemeChanged: false },
        }, 409);
      }
    }

    const response = await runtime.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-MMG-Runtime", BUILD);
    headers.set("X-Kairos-Website-Retool", "custom-schema-inspection-v1");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Website-Retool": "custom-schema-inspection-v1",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
