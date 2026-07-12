const nativeFetch = window.fetch.bind(window);
const THEME_PLAN_PATH = "/api/theme-plan";
const GENERAL_KAIROS_PATH = "/api/kairos";
const ACTIONS_PATH = "/api/actions";

window.fetch = async function kairosGovernedFetch(input, init = {}) {
  const requestURL = resolveURL(input);
  const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

  if (method !== "POST" || !requestURL) {
    return nativeFetch(input, init);
  }

  const body = readRequestBody(input, init);
  if (!body) {
    return nativeFetch(input, init);
  }

  if (requestURL.pathname === ACTIONS_PATH && shouldRoutePreparedAction(body)) {
    return nativeFetch(rewriteInput(input, requestURL, THEME_PLAN_PATH), {
      ...init,
      body: JSON.stringify({ objective: body.objective }),
    });
  }

  if (requestURL.pathname === GENERAL_KAIROS_PATH && shouldRouteChatObjective(body.objective)) {
    const response = await nativeFetch(rewriteInput(input, requestURL, THEME_PLAN_PATH), {
      ...init,
      body: JSON.stringify({ objective: body.objective }),
    });
    return adaptThemePlanForExecutiveChat(response);
  }

  return nativeFetch(input, init);
};

function shouldRoutePreparedAction(body) {
  if (body?.phase !== "prepare") return false;
  if (body?.actionType === "shopify.theme.files.upsert") return true;
  if (body?.actionType === "shopify.homepage.audit") return true;
  return shouldRouteChatObjective(body?.objective);
}

function shouldRouteChatObjective(objective) {
  const text = String(objective || "").toLowerCase();
  if (!text) return false;

  const shopifyIntent = /\b(shopify|theme|homepage|storefront)\b/.test(text);
  const planningIntent = /\b(prepare|regenerate|proposal|package|inspect|inspection|source|graphql|mutation plan|theme-plan)\b/.test(text);
  const explicitRoute = text.includes("/api/theme-plan");

  return explicitRoute || (shopifyIntent && planningIntent);
}

async function adaptThemePlanForExecutiveChat(response) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    return jsonResponse(body, response.status, response.headers);
  }

  const files = Array.isArray(body?.mutationPlan?.files) ? body.mutationPlan.files : [];
  const fileSummary = files.length
    ? files.map(file => `${file.key} · ${String(file.expectedSha256 || "hash unavailable").slice(0, 12)}…`).join("\n")
    : "No executable files were proposed.";
  const message = [
    body.summary || "Kairos prepared a Shopify Admin source-grounded proposal.",
    "",
    `Theme: ${body?.sourceEvidence?.themeName || "Current main theme"} (${body?.sourceEvidence?.themeId || body?.mutationPlan?.themeId || "unknown"})`,
    `Adapter: ${body?.sourceEvidence?.adapter || "unknown"}`,
    `Files: ${files.length}`,
    fileSummary,
    "",
    files.length
      ? "Open the governed proposal review in the Command Center before authorizing any production mutation."
      : "No production mutation is approval-ready. Review the source-specific blocker.",
  ].join("\n");

  return jsonResponse({
    ...body,
    message,
    department: "Website Operations",
    routedEndpoint: THEME_PLAN_PATH,
  }, response.status, response.headers);
}

function resolveURL(input) {
  try {
    const value = input instanceof Request ? input.url : input;
    return new URL(value, window.location.origin);
  } catch {
    return null;
  }
}

function rewriteInput(input, url, pathname) {
  const nextURL = new URL(url.href);
  nextURL.pathname = pathname;
  nextURL.search = "";
  nextURL.hash = "";

  if (input instanceof Request) {
    return new Request(nextURL.href, input);
  }
  return nextURL.href;
}

function readRequestBody(input, init) {
  const raw = init?.body;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function jsonResponse(body, status, sourceHeaders) {
  const headers = new Headers(sourceHeaders || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-MMG-Routed-Endpoint", THEME_PLAN_PATH);
  return new Response(JSON.stringify(body), { status, headers });
}
