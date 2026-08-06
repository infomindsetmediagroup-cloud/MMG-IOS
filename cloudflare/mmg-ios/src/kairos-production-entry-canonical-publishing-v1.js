import canonicalRuntime, {
  KairosProject as BaseKairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
  KairosAutonomyLedger,
} from "./kairos-production-entry-local-canonical-v1.js";
import {
  handleCanonicalPublishingRequest,
  KAIROS_CANONICAL_PUBLISHING_ROUTER_BUILD,
} from "./kairos-canonical-publishing-router-v1.js";
import {
  KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
  MMG_CANONICAL_IDENTITY,
  canonicalizePipelineRecord,
  sanitizeCanonicalPublicRecord,
} from "./kairos-canonical-publishing-contract-v1.js";

export {
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
  KairosAutonomyLedger,
};

export const KAIROS_CANONICAL_PUBLISHING_ENTRY_BUILD =
  "kairos-canonical-publishing-entry-20260806-2";

export class KairosProject extends BaseKairosProject {
  async fetch(request) {
    return super.fetch(await canonicalizeDurableRequest(request));
  }
}

export default {
  async fetch(request, env, ctx) {
    const publishingResponse = await handleCanonicalPublishingRequest(
      request,
      env,
      ctx,
    );
    if (publishingResponse) return stamp(publishingResponse);
    return stamp(await canonicalRuntime.fetch(request, env, ctx));
  },

  async scheduled(controller, env, ctx) {
    if (typeof canonicalRuntime.scheduled === "function") {
      return canonicalRuntime.scheduled(controller, env, ctx);
    }
    return undefined;
  },
};

async function canonicalizeDurableRequest(request) {
  const url = new URL(request.url);

  if (
    request.method === "POST" &&
    url.pathname === "/product-manufacturing/create"
  ) {
    const body = await request.clone().json().catch(() => ({}));
    const canonicalBody = sanitizeCanonicalPublicRecord({
      ...body,
      author: MMG_CANONICAL_IDENTITY.author,
    });
    return replaceJSONBody(request, canonicalBody);
  }

  if (
    request.method === "PUT" &&
    /^\/registry\/manuscripts\/[a-z0-9-]{8,}\/auto-pipeline$/i.test(
      url.pathname,
    )
  ) {
    const body = await request.clone().json().catch(() => ({}));
    return replaceJSONBody(request, canonicalizePipelineRecord(body));
  }

  return request;
}

function replaceJSONBody(request, body) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set(
    "X-Kairos-Canonical-Contract",
    KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
  );
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
  });
}

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set(
    "X-Kairos-Canonical-Publishing-Entry",
    KAIROS_CANONICAL_PUBLISHING_ENTRY_BUILD,
  );
  headers.set(
    "X-Kairos-Canonical-Publishing",
    headers.get("X-Kairos-Canonical-Publishing") ||
      KAIROS_CANONICAL_PUBLISHING_ROUTER_BUILD,
  );
  headers.set(
    "X-Kairos-Canonical-Contract",
    headers.get("X-Kairos-Canonical-Contract") ||
      KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
