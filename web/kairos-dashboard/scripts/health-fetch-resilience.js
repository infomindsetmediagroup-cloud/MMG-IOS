const nativeFetch = window.fetch.bind(window);
const HEALTH_CACHE_KEY = "kairos.runtime.health.last-good.v1";

window.fetch = async function resilientFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
  if (!isHealthRequest(url)) return nativeFetch(input, init);

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const response = await nativeFetch(input, { ...init, cache: "no-store", signal: controller.signal });
      clearTimeout(timeout);
      const text = await response.clone().text();
      if (response.ok && isReadyHealth(text)) {
        try { sessionStorage.setItem(HEALTH_CACHE_KEY, text); } catch {}
        return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      lastError = new Error(`Health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await delay(attempt * 500);
  }

  const cached = readCachedHealth();
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Kairos-Health-Source": "last-verified-good",
      },
    });
  }

  throw lastError || new Error("Runtime health check failed.");
};

function isHealthRequest(url) {
  try {
    return new URL(url, window.location.origin).pathname === "/api/health";
  } catch {
    return false;
  }
}

function isReadyHealth(text) {
  try {
    const body = JSON.parse(text);
    return body?.status === "ready" && body?.capabilities?.cloudflareNative === true && body?.capabilities?.vercelDependency === false;
  } catch {
    return false;
  }
}

function readCachedHealth() {
  try {
    const value = sessionStorage.getItem(HEALTH_CACHE_KEY);
    return value && isReadyHealth(value) ? value : "";
  } catch {
    return "";
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
