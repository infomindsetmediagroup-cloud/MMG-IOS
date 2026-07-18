import resourceRuntime, { KairosProject } from "./kairos-production-entry-resource-suite-v1.js";
import { handleLiveLinkReconciliationBuild, KAIROS_LIVE_LINK_RECONCILIATION_BUILD } from "./kairos-live-link-reconciliation-publisher-20260718.js";

const BUILD = "kairos-production-entry-live-link-reconciliation-20260718-1";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const reconciliation = await handleLiveLinkReconciliationBuild(request, env);
      if (reconciliation) return stamp(reconciliation);
      return stamp(await resourceRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({
        status: "failed",
        build: BUILD,
        liveLinkReconciliation: KAIROS_LIVE_LINK_RECONCILIATION_BUILD,
        error: {
          code: error?.code || "live_link_reconciliation_entry_failed",
          message: error instanceof Error ? error.message : "Kairos could not complete the link reconciliation request."
        },
        safeguards: {
          resourceRuntimeDelegatedUnchanged: true,
          companyRuntimeDelegatedUnchanged: true,
          navigationV8Untouched: true,
          liveThemeChanged: false
        }
      }, Number(error?.status || error?.statusCode || 500));
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof resourceRuntime.scheduled === "function") return resourceRuntime.scheduled(controller, env, ctx);
  }
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Live-Link-Reconciliation-Entry", BUILD);
  headers.set("X-MMG-Live-Link-Reconciliation", KAIROS_LIVE_LINK_RECONCILIATION_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Live-Link-Reconciliation-Entry": BUILD,
      "X-MMG-Live-Link-Reconciliation": KAIROS_LIVE_LINK_RECONCILIATION_BUILD,
      "X-Content-Type-Options": "nosniff"
    }
  });
}
