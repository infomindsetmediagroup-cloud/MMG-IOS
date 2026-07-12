const nativeFetch = window.fetch.bind(window);
const RETRYABLE_PATHS = new Set(["/api/kairos", "/api/theme-plan"]);

window.fetch = async function kairosResilientFetch(input, init = {}) {
  const requestURL = typeof input === "string" ? new URL(input, location.origin) : new URL(input.url, location.origin);
  const method = String(init?.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();
  const retryable = method === "POST" && RETRYABLE_PATHS.has(requestURL.pathname);

  const first = await nativeFetch(input, init);
  if (!retryable || first.ok) return first;

  const diagnostic = await responseText(first);
  if (!/fetch is aborted|aborterror|timed out|timeout|provider_error/i.test(diagnostic)) return first;

  await delay(900);
  return nativeFetch(input, init);
};

async function responseText(response) {
  try { return await response.clone().text(); }
  catch { return ""; }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
