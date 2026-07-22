import { handleShopifyStagingObjectRequest } from "./kairos-shopify-staging-adapter-v1.js";

const PREFIX = "/api/kairos/projects";

export { handleShopifyStagingObjectRequest };

export async function handleShopifyStaging(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/kairos\/projects\/([^/]+)\/shopify-staging(?:\/(rollback))?$/);
  if (!match || request.method !== "POST") return null;

  const required = String(env.KAIROS_API_TOKEN || "").trim();
  if (required && request.headers.get("Authorization") !== `Bearer ${required}`) {
    return response({ status: "failed", error: { code: "unauthorized", message: "Valid Kairos bearer authorization is required." } }, 401);
  }
  if (!env.KAIROS_PROJECTS) {
    return response({ status: "failed", error: { code: "publishing_storage_unavailable", message: "KAIROS_PROJECTS binding is unavailable." } }, 503);
  }

  const projectId = decodeURIComponent(match[1]);
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
    return response({ status: "failed", error: { code: "invalid_project_id", message: "Project ID is invalid." } }, 400);
  }

  const target = env.KAIROS_PROJECTS.get(env.KAIROS_PROJECTS.idFromName(`publishing:${projectId}`));
  const suffix = match[2] ? "/rollback" : "";
  const internal = new URL(`/internal/publishing/projects/${encodeURIComponent(projectId)}/shopify-staging${suffix}`, request.url);
  const headers = new Headers(request.headers);
  headers.delete("Authorization");
  return target.fetch(new Request(internal, { method: "POST", headers }));
}

function response(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
