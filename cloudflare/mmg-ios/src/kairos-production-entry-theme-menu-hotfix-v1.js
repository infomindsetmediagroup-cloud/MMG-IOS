import previousRuntime, { KairosProject } from "./kairos-production-entry-native-main-menu-v1.js";
import {
  handleCanonicalNavigationAndPageShellPublish,
  KAIROS_CANONICAL_SHELL_BUILD,
  KAIROS_NATIVE_NAVIGATION_BUILD,
  KAIROS_PAGE_SHELL_BUILD,
} from "./kairos-canonical-navigation-page-shell-publisher-v1.js";
import {
  handlePageShellPublish,
  PAGE_SHELL_CONFIRMATION,
  PAGE_SHELL_PATH,
} from "./kairos-page-shell-publisher-v1.js";
import {
  handleNativePageRepair,
  KAIROS_NATIVE_PAGE_REPAIR_BUILD,
  NATIVE_PAGE_REPAIR_CONFIRMATION,
  NATIVE_PAGE_REPAIR_PATH,
} from "./kairos-native-page-content-repair-v1.js";
import { handleThemeMenuHotfixPublish, KAIROS_THEME_MENU_HOTFIX_BUILD } from "./kairos-theme-menu-hotfix-publisher-20260718.js";
import { handleLiveHeaderNavigationPublish, KAIROS_LIVE_HEADER_BUILD } from "./kairos-live-header-navigation-publisher-20260719.js";
import { handleAllThemeNavigationPublish, KAIROS_ALL_THEME_NAVIGATION_BUILD } from "./kairos-all-theme-navigation-publisher-20260719.js";
import { handleKairosMcp, KAIROS_MCP_BUILD } from "./kairos-mcp-server-v1.js";
import { handleKairosCommerceOrchestrator, KAIROS_COMMERCE_ORCHESTRATOR_BUILD } from "./kairos-commerce-orchestrator-v1.js";

// Canonical source remains kairos-native-navigation-theme-publisher-v9.js.
const BUILD = "kairos-production-entry-canonical-navigation-20260721-11";
export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const commerceResponse = await handleKairosCommerceOrchestrator(request, env);
      if (commerceResponse) return stamp(commerceResponse);

      const mcpResponse = await handleKairosMcp(request, env);
      if (mcpResponse) return stamp(mcpResponse);

      const combinedPageRepairResponse = await handleAuditedPageShellPublish(request, env);
      if (combinedPageRepairResponse) return stamp(combinedPageRepairResponse);

      const nativePageRepairResponse = await handleNativePageRepair(request, env);
      if (nativePageRepairResponse) return stamp(nativePageRepairResponse);

      const canonicalShellResponse = await handleCanonicalNavigationAndPageShellPublish(request, env);
      if (canonicalShellResponse) return stamp(canonicalShellResponse);

      const allThemeResponse = await handleAllThemeNavigationPublish(request, env);
      if (allThemeResponse) return stamp(allThemeResponse);

      const liveHeaderResponse = await handleLiveHeaderNavigationPublish(request, env);
      if (liveHeaderResponse) return stamp(liveHeaderResponse);

      const response = await handleThemeMenuHotfixPublish(request, env);
      if (response) return stamp(response);
      return stamp(await previousRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({
        status: "failed",
        build: BUILD,
        canonicalShell: KAIROS_CANONICAL_SHELL_BUILD,
        canonicalNavigation: KAIROS_NATIVE_NAVIGATION_BUILD,
        pageShell: KAIROS_PAGE_SHELL_BUILD,
        nativePageRepair: KAIROS_NATIVE_PAGE_REPAIR_BUILD,
        mcpBuild: KAIROS_MCP_BUILD,
        commerceOrchestrator: KAIROS_COMMERCE_ORCHESTRATOR_BUILD,
        allThemeNavigation: KAIROS_ALL_THEME_NAVIGATION_BUILD,
        liveHeaderNavigation: KAIROS_LIVE_HEADER_BUILD,
        themeMenuHotfix: KAIROS_THEME_MENU_HOTFIX_BUILD,
        error: {
          code: error?.code || "canonical_navigation_entry_failed",
          message: error instanceof Error ? error.message : "Canonical navigation, commerce orchestration, or page repair failed."
        }
      }, Number(error?.status || 500));
    }
  },
  async scheduled(controller, env, ctx) {
    if (controller?.cron === "* * * * *") {
      const request = new Request(`https://internal${PAGE_SHELL_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: PAGE_SHELL_CONFIRMATION }),
      });

      try {
        const response = await handleAuditedPageShellPublish(request, env);
        const body = await safeResponseJSON(response?.clone());
        if (!response?.ok || body?.status !== "completed" || body?.verification?.exactPageReadBack !== true) {
          const message = body?.error?.message || body?.message || `Scheduled audited page repair returned HTTP ${response?.status || 500}.`;
          if (isShopifyPageAccessDenied(message)) {
            console.warn("Scheduled audited page repair skipped: Shopify page access is not authorized.");
          } else {
            throw new Error(message);
          }
        }
      } catch (error) {
        if (isShopifyPageAccessDenied(error?.message)) {
          console.warn("Scheduled audited page repair skipped: Shopify page access is not authorized.");
        } else {
          throw error;
        }
      }
    }

    if (typeof previousRuntime.scheduled === "function") {
      try {
        return await previousRuntime.scheduled(controller, env, ctx);
      } catch (error) {
        if (isShopifyPageAccessDenied(error?.message)) {
          console.warn("Legacy scheduled page repair skipped: Shopify page access is not authorized.");
          return;
        }
        throw error;
      }
    }
  }
};

async function handleAuditedPageShellPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== PAGE_SHELL_PATH) return null;

  const pageShellResponse = await handlePageShellPublish(request.clone(), env);
  const pageShell = await safeResponseJSON(pageShellResponse?.clone());
  if (!pageShellResponse?.ok || pageShell?.status !== "completed") return pageShellResponse;

  const nativeRequest = new Request(new URL(NATIVE_PAGE_REPAIR_PATH, request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: NATIVE_PAGE_REPAIR_CONFIRMATION }),
  });
  const nativeResponse = await handleNativePageRepair(nativeRequest, env);
  const nativePageRepair = await safeResponseJSON(nativeResponse?.clone());
  if (!nativeResponse?.ok || nativePageRepair?.status !== "completed") {
    return json({
      status: "failed",
      build: KAIROS_PAGE_SHELL_BUILD,
      pageShell,
      nativePageRepair,
      error: {
        code: "native_page_repair_failed_after_page_shell",
        message: "The shared page shell published, but the audited Shopify page-body repair failed.",
      },
    }, nativeResponse?.status || 502);
  }

  return json({
    ...pageShell,
    summary: `${pageShell.summary} The audited Shopify page bodies were also repaired directly.`,
    nativePageRepair,
    verification: {
      ...(pageShell.verification || {}),
      nativePageRepairValid: nativePageRepair.verification?.valid === true,
      exactPageReadBack: nativePageRepair.verification?.exactPageReadBack === true,
      toolkitMiniNavigationRemoved:
        nativePageRepair.verification?.toolkitMiniNavigationRemoved === true,
      publishingDirectoryRemoved:
        nativePageRepair.verification?.publishingDirectoryRemoved === true,
      projectGuideLinksRepaired:
        nativePageRepair.verification?.projectGuideLinksRepaired === true,
      nativeTitleSuppressionInstalled:
        nativePageRepair.verification?.nativeTitleSuppressionInstalled === true,
    },
  });
}

function isShopifyPageAccessDenied(message) {
  return /access denied for pages field/i.test(String(message || ""));
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Canonical-Navigation-Entry", BUILD);
  headers.set("X-MMG-Canonical-Shell", KAIROS_CANONICAL_SHELL_BUILD);
  headers.set("X-MMG-Native-Navigation", KAIROS_NATIVE_NAVIGATION_BUILD);
  headers.set("X-MMG-Page-Shell", KAIROS_PAGE_SHELL_BUILD);
  headers.set("X-MMG-Native-Page-Repair", KAIROS_NATIVE_PAGE_REPAIR_BUILD);
  headers.set("X-MMG-All-Theme-Navigation", KAIROS_ALL_THEME_NAVIGATION_BUILD);
  headers.set("X-MMG-Live-Header-Navigation", KAIROS_LIVE_HEADER_BUILD);
  headers.set("X-MMG-Theme-Menu-Hotfix", KAIROS_THEME_MENU_HOTFIX_BUILD);
  headers.set("X-Kairos-MCP", KAIROS_MCP_BUILD);
  headers.set("X-Kairos-Commerce-Orchestrator", KAIROS_COMMERCE_ORCHESTRATOR_BUILD);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function safeResponseJSON(response) {
  try {
    return await response?.json();
  } catch {
    return {};
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Canonical-Navigation-Entry": BUILD,
      "X-MMG-Canonical-Shell": KAIROS_CANONICAL_SHELL_BUILD,
      "X-MMG-Native-Navigation": KAIROS_NATIVE_NAVIGATION_BUILD,
      "X-MMG-Page-Shell": KAIROS_PAGE_SHELL_BUILD,
      "X-MMG-Native-Page-Repair": KAIROS_NATIVE_PAGE_REPAIR_BUILD,
      "X-MMG-All-Theme-Navigation": KAIROS_ALL_THEME_NAVIGATION_BUILD,
      "X-MMG-Live-Header-Navigation": KAIROS_LIVE_HEADER_BUILD,
      "X-MMG-Theme-Menu-Hotfix": KAIROS_THEME_MENU_HOTFIX_BUILD,
      "X-Kairos-MCP": KAIROS_MCP_BUILD,
      "X-Kairos-Commerce-Orchestrator": KAIROS_COMMERCE_ORCHESTRATOR_BUILD
    }
  });
}
