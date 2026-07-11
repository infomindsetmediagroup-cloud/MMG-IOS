const MARKDOWN_LINK = /^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/i;

export function parseRuntimeBaseURL(value) {
  let candidate = value?.trim();
  if (!candidate) {
    throw new Error("KAIROS_RUNTIME_BASE_URL is required.");
  }

  const markdownLink = candidate.match(MARKDOWN_LINK);
  if (markdownLink) {
    candidate = markdownLink[2];
  } else {
    // Some clients paste a rendered link as URL](URL). Prefer the visible URL
    // and discard the injected Markdown destination before parsing.
    const injectedDestination = candidate.indexOf("](");
    if (injectedDestination !== -1) {
      candidate = candidate.slice(0, injectedDestination).replace(/^\[/, "");
    }
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("KAIROS_RUNTIME_BASE_URL must be a valid absolute URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("KAIROS_RUNTIME_BASE_URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("KAIROS_RUNTIME_BASE_URL must not include credentials, a query, or a fragment.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("KAIROS_RUNTIME_BASE_URL must be an origin without a path.");
  }

  return url.origin;
}
