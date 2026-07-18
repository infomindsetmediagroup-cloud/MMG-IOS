import immutableRuntime, { KairosProject } from "./kairos-production-entry-immutable-v1.js";
import { handleCompanySiteSuiteBuild, KAIROS_COMPANY_SITE_SUITE_BUILD } from "./kairos-company-site-suite-publisher-20260718.js";

const BUILD = "kairos-production-entry-company-suite-20260718-1";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const companySuite = await handleCompanySiteSuiteBuild(request, env);
      if (companySuite) return stamp(companySuite);
      return stamp(await immutableRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({
        status: "failed",
        build: BUILD,
        companySiteSuite: KAIROS_COMPANY_SITE_SUITE_BUILD,
        error: {
          code: error?.code || "company_suite_entry_failed",
          message: error instanceof Error ? error.message : "Kairos could not complete the Company site suite request.",
        },
        safeguards: {
          immutableRuntimeDelegatedUnchanged: true,
          navigationV8Untouched: true,
          liveThemeChanged: false,
        },
      }, Number(error?.status || error?.statusCode || 500));
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof immutableRuntime.scheduled === "function") return immutableRuntime.scheduled(controller, env, ctx);
  },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Company-Suite-Entry", BUILD);
  headers.set("X-MMG-Company-Site-Suite", KAIROS_COMPANY_SITE_SUITE_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Company-Suite-Entry": BUILD,
      "X-MMG-Company-Site-Suite": KAIROS_COMPANY_SITE_SUITE_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
