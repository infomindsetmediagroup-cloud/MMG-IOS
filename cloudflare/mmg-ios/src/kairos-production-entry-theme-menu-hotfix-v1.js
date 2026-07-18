import previousRuntime, { KairosProject } from "./kairos-production-entry-native-main-menu-v1.js";
import { handleThemeMenuHotfixPublish, KAIROS_THEME_MENU_HOTFIX_BUILD } from "./kairos-theme-menu-hotfix-publisher-20260718.js";

const BUILD = "kairos-production-entry-theme-menu-hotfix-20260718-1";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await handleThemeMenuHotfixPublish(request, env);
      if (response) return stamp(response);
      return stamp(await previousRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({ status: "failed", build: BUILD, themeMenuHotfix: KAIROS_THEME_MENU_HOTFIX_BUILD, error: { code: error?.code || "theme_menu_hotfix_entry_failed", message: error instanceof Error ? error.message : "Theme menu hotfix publication failed." } }, Number(error?.status || 500));
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof previousRuntime.scheduled === "function") return previousRuntime.scheduled(controller, env, ctx);
  }
};

function stamp(response) { const headers = new Headers(response.headers); headers.set("X-MMG-Theme-Menu-Hotfix-Entry", BUILD); headers.set("X-MMG-Theme-Menu-Hotfix", KAIROS_THEME_MENU_HOTFIX_BUILD); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Theme-Menu-Hotfix-Entry": BUILD, "X-MMG-Theme-Menu-Hotfix": KAIROS_THEME_MENU_HOTFIX_BUILD } }); }
