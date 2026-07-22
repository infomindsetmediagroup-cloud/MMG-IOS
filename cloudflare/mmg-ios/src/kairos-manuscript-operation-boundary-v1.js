const BUILD = "kairos-manuscript-operation-boundary-20260722-1";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MANUSCRIPT_PROJECT = /^\/api\/production-registry\/projects\/manuscript-studio-[a-z0-9-]+$/i;
const MANUSCRIPT_PREFIXES = [
  "/api/manuscript/",
  "/api/production-registry/manuscripts/",
];
const MANUSCRIPT_EXACT = new Set([
  "/api/publishing/jobs",
  "/api/content/generate",
  "/api/native-intelligence/route",
]);
const WEBSITE_MUTATION = /(shopify|navigation|page-shell|theme|main-menu|live-header|website-builder|page-compiler|product-launch|product-publication|product-media)/i;

export { BUILD as KAIROS_MANUSCRIPT_OPERATION_BOUNDARY_BUILD };

export async function inspectManuscriptOperation(request) {
  const method = String(request?.method || "GET").toUpperCase();
  const url = new URL(request.url);
  const path = url.pathname;

  if (!MUTATING_METHODS.has(method)) {
    return allow("read-only", path, method);
  }

  if (WEBSITE_MUTATION.test(path)) {
    return deny("WEBSITE_MUTATION_DENIED", "Website and Shopify mutations are outside the manuscript runtime.", path, method);
  }

  if (MANUSCRIPT_PROJECT.test(path) || MANUSCRIPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return allow("manuscript-project", path, method);
  }

  if (path === "/api/content/generate") {
    const body = await safeJSON(request.clone());
    return body?.type === "book_package"
      ? allow("book-package", path, method)
      : deny("NON_MANUSCRIPT_CONTENT_DENIED", "Only book-package generation is authorized in manuscript mode.", path, method);
  }

  if (path === "/api/hub/run") {
    const body = await safeJSON(request.clone());
    return String(body?.action || "").toLowerCase() === "publishing-studio"
      ? allow("publishing-objective", path, method)
      : deny("NON_MANUSCRIPT_HUB_ACTION_DENIED", "Only the Publishing Studio action is authorized in manuscript mode.", path, method);
  }

  if (MANUSCRIPT_EXACT.has(path)) {
    return allow("manuscript-runtime", path, method);
  }

  return deny("OPERATION_OUT_OF_SCOPE", "This operation is not authorized while Kairos is in manuscript-only mode.", path, method);
}

function allow(scope, path, method) {
  return Object.freeze({ allowed: true, scope, path, method, build: BUILD });
}

function deny(code, message, path, method) {
  return Object.freeze({ allowed: false, code, message, path, method, build: BUILD });
}

async function safeJSON(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
