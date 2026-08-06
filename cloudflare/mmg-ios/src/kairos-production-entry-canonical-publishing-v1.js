import canonicalRuntime, {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
  KairosAutonomyLedger,
} from "./kairos-production-entry-local-canonical-v1.js";
import {
  handleCanonicalPublishingRequest,
  KAIROS_CANONICAL_PUBLISHING_ROUTER_BUILD,
} from "./kairos-canonical-publishing-router-v1.js";
import { KAIROS_CANONICAL_PUBLISHING_CONTRACT_BUILD } from "./kairos-canonical-publishing-contract-v1.js";

export {
  KairosProject,
  KairosProjectAgent,
  KairosProjectFoundationWorkflow,
  KairosManuscriptGenerationWorkflow,
  KairosAutonomyLedger,
};

export const KAIROS_CANONICAL_PUBLISHING_ENTRY_BUILD =
  "kairos-canonical-publishing-entry-20260806-1";

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
