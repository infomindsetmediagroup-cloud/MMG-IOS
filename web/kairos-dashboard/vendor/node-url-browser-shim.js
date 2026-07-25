// Browser-only replacement for WebLLM's guarded Node fallback.
// The browser production path must never execute this function.
export function pathToFileURL() {
  throw new Error("Node pathToFileURL is unavailable in the Kairos browser runtime.");
}
