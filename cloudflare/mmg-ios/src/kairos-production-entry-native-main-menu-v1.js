import previousRuntime, { KairosProject } from "./kairos-production-entry-mobile-navigation-taxonomy-v1.js";
import { handleNativeMainMenuPublish, KAIROS_NATIVE_MAIN_MENU_BUILD } from "./kairos-native-main-menu-publisher-20260718.js";

const BUILD = "kairos-production-entry-native-main-menu-20260718-2";
const DEPLOYMENT_IDENTITY_PATH = "/api/deployment/identity";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname === DEPLOYMENT_IDENTITY_PATH) {
        return json({
          status: "ok",
          service: "mmg-ios",
          entryBuild: BUILD,
          navigationBuild: KAIROS_NATIVE_MAIN_MENU_BUILD,
          deploymentSha: String(env.DEPLOYMENT_SHA || "unknown"),
          deployedAt: String(env.DEPLOYED_AT || "unknown")
        });
      }

      const response = await handleNativeMainMenuPublish(request, env);
      if (response) return stamp(response, env);
      return stamp(await previousRuntime.fetch(request, env, ctx), env);
    } catch (error) {
      return json({
        status: "failed",
        build: BUILD,
        nativeMainMenu: KAIROS_NATIVE_MAIN_MENU_BUILD,
        deploymentSha: String(env.DEPLOYMENT_SHA || "unknown"),
        error: {
          code: error?.code || "native_main_menu_entry_failed",
          message: error instanceof Error ? error.message : "Native main-menu publication failed."
        }
      }, Number(error?.status || 500));
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof previousRuntime.scheduled === "function") return previousRuntime.scheduled(controller, env, ctx);
  }
};

function stamp(response, env) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Native-Main-Menu-Entry", BUILD);
  headers.set("X-MMG-Native-Main-Menu", KAIROS_NATIVE_MAIN_MENU_BUILD);
  headers.set("X-MMG-Deployment-SHA", String(env.DEPLOYMENT_SHA || "unknown"));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Native-Main-Menu-Entry": BUILD,
      "X-MMG-Native-Main-Menu": KAIROS_NATIVE_MAIN_MENU_BUILD
    }
  });
}
