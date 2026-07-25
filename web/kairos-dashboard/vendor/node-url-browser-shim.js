// Browser-only shim for a Node fallback that WebLLM guards behind a runtime environment check.
// This module must never be executed in Kairos browser production.
export function pathToFileURL() {
  throw new Error("Node pathToFileURL is unavailable in the Kairos browser runtime.");
}
