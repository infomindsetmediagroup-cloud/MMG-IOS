import {
  handleNativeNavigationPublish,
  KAIROS_NATIVE_NAVIGATION_BUILD,
  NATIVE_NAVIGATION_CONFIRMATION,
  NATIVE_NAVIGATION_PATH,
} from "./kairos-native-navigation-theme-publisher-v9.js";
import {
  handlePageShellPublish,
  KAIROS_PAGE_SHELL_BUILD,
  PAGE_SHELL_CONFIRMATION,
  PAGE_SHELL_PATH,
} from "./kairos-page-shell-publisher-v1.js";

export const KAIROS_CANONICAL_SHELL_BUILD = "kairos-canonical-navigation-page-shell-20260719-3";
export { KAIROS_NATIVE_NAVIGATION_BUILD, KAIROS_PAGE_SHELL_BUILD };

export async function handleCanonicalNavigationAndPageShellPublish(request, env) {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== NATIVE_NAVIGATION_PATH) return null;

  const payload = await safeRequestJSON(request.clone());
  if (payload?.confirmation !== NATIVE_NAVIGATION_CONFIRMATION) {
    return json({
      status: "failed",
      build: KAIROS_CANONICAL_SHELL_BUILD,
      error: {
        code: "canonical_shell_confirmation_required",
        message: `Provide the exact confirmation phrase: ${NATIVE_NAVIGATION_CONFIRMATION}.`,
      },
    }, 403);
  }

  const navigationResponse = await handleNativeNavigationPublish(request.clone(), env);
  if (!navigationResponse) return null;
  const navigation = await safeResponseJSON(navigationResponse.clone());
  if (!navigationResponse.ok) return navigationResponse;

  const pageShellRequest = new Request(new URL(PAGE_SHELL_PATH, request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: PAGE_SHELL_CONFIRMATION }),
  });
  const pageShellResponse = await handlePageShellPublish(pageShellRequest, env);
  const pageShell = await safeResponseJSON(pageShellResponse?.clone());
  if (!pageShellResponse?.ok || pageShell?.status !== "completed") {
    const error = new Error(pageShell?.error?.message || "The MMG page-shell publication failed after canonical navigation publication.");
    error.status = Number(pageShellResponse?.status || 502);
    error.code = pageShell?.error?.code || "canonical_page_shell_publish_failed";
    throw error;
  }

  return json({
    ...navigation,
    status: "completed",
    build: KAIROS_NATIVE_NAVIGATION_BUILD,
    compositeBuild: KAIROS_CANONICAL_SHELL_BUILD,
    completedAt: new Date().toISOString(),
    summary: "Published the approved five-group MMG navigation and the audited page-shell reconciliation into the verified Shopify MAIN theme.",
    pageShell: {
      status: pageShell.status,
      build: pageShell.build,
      completedAt: pageShell.completedAt,
      pages: pageShell.pages,
      theme: pageShell.theme,
      verification: pageShell.verification,
      safeguards: pageShell.safeguards,
    },
    verification: {
      ...(navigation.verification || {}),
      pageShellPublished: true,
      pageShellBuild: KAIROS_PAGE_SHELL_BUILD,
      pageShellExactThemeFileReadBack: pageShell?.verification?.exactThemeFileReadBack === true,
      pageShellLayoutInjectionPresent: pageShell?.verification?.layoutInjectionPresent === true,
      auditedPages: pageShell?.verification?.targetPages || [],
    },
    safeguards: {
      ...(navigation.safeguards || {}),
      pageShellPublishedWithCanonicalNavigation: true,
      workersAIUsed: false,
    },
  });
}

async function safeRequestJSON(request) {
  try { return await request.json(); } catch { return {}; }
}

async function safeResponseJSON(response) {
  try { return await response.json(); } catch { return {}; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Canonical-Shell": KAIROS_CANONICAL_SHELL_BUILD,
      "X-MMG-Native-Navigation": KAIROS_NATIVE_NAVIGATION_BUILD,
      "X-MMG-Page-Shell": KAIROS_PAGE_SHELL_BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
