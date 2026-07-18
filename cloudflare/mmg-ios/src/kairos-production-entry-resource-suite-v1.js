import companyRuntime, { KairosProject } from "./kairos-production-entry-company-suite-v1.js";
import { handleResourceDiscoverySuiteBuild, KAIROS_RESOURCE_DISCOVERY_SUITE_BUILD } from "./kairos-resource-discovery-suite-publisher-20260718.js";

const BUILD = "kairos-production-entry-resource-suite-20260718-1";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const resourceSuite = await handleResourceDiscoverySuiteBuild(request, env);
      if (resourceSuite) return stamp(resourceSuite);
      return stamp(await companyRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({
        status: "failed",
        build: BUILD,
        resourceDiscoverySuite: KAIROS_RESOURCE_DISCOVERY_SUITE_BUILD,
        error: {
          code: error?.code || "resource_suite_entry_failed",
          message: error instanceof Error ? error.message : "Kairos could not complete the resource suite request.",
        },
        safeguards: {
          companyRuntimeDelegatedUnchanged: true,
          navigationV8Untouched: true,
          liveThemeChanged: false,
        },
      }, Number(error?.status || error?.statusCode || 500));
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof companyRuntime.scheduled === "function") return companyRuntime.scheduled(controller, env, ctx);
  },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Resource-Suite-Entry", BUILD);
  headers.set("X-MMG-Resource-Discovery-Suite", KAIROS_RESOURCE_DISCOVERY_SUITE_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Resource-Suite-Entry": BUILD,
      "X-MMG-Resource-Discovery-Suite": KAIROS_RESOURCE_DISCOVERY_SUITE_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
