import previousRuntime, { KairosProject } from "./kairos-production-entry-native-main-menu-v1.js";
import { handleThemeMenuHotfixPublish, KAIROS_THEME_MENU_HOTFIX_BUILD } from "./kairos-theme-menu-hotfix-publisher-20260718.js";
import { handleLiveHeaderNavigationPublish, KAIROS_LIVE_HEADER_BUILD } from "./kairos-live-header-navigation-publisher-20260719.js";
import { handleKairosMcp, KAIROS_MCP_BUILD } from "./kairos-mcp-server-v1.js";

const BUILD = "kairos-production-entry-live-header-navigation-20260719-1";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const mcpResponse = await handleKairosMcp(request, env);
      if (mcpResponse) return stamp(mcpResponse);

      const liveHeaderResponse = await handleLiveHeaderNavigationPublish(request, env);
      if (liveHeaderResponse) return stamp(liveHeaderResponse);

      const response = await handleThemeMenuHotfixPublish(request, env);
      if (response) return stamp(response);
      return stamp(await previousRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({ status: "failed", build: BUILD, mcpBuild: KAIROS_MCP_BUILD, liveHeaderNavigation: KAIROS_LIVE_HEADER_BUILD, themeMenuHotfix: KAIROS_THEME_MENU_HOTFIX_BUILD, error: { code: error?.code || "live_header_navigation_entry_failed", message: error instanceof Error ? error.message : "Live header navigation publication failed." } }, Number(error?.status || 500));
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof previousRuntime.scheduled === "function") return previousRuntime.scheduled(controller, env, ctx);
  }
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Live-Header-Entry", BUILD);
  headers.set("X-MMG-Live-Header-Navigation", KAIROS_LIVE_HEADER_BUILD);
  headers.set("X-MMG-Theme-Menu-Hotfix", KAIROS_THEME_MENU_HOTFIX_BUILD);
  headers.set("X-Kairos-MCP", KAIROS_MCP_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Live-Header-Entry": BUILD, "X-MMG-Live-Header-Navigation": KAIROS_LIVE_HEADER_BUILD, "X-MMG-Theme-Menu-Hotfix": KAIROS_THEME_MENU_HOTFIX_BUILD, "X-Kairos-MCP": KAIROS_MCP_BUILD } }); }
