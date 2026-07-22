import previousRuntime, { KairosProject as PreviousKairosProject } from "./kairos-production-entry-theme-menu-hotfix-v1.js";
import {
  handleCoverImageProduction,
  handleCoverImageProductionObjectRequest,
} from "./kairos-cover-image-production-v1.js";

const BUILD = "kairos-production-entry-cover-images-20260722-1";

export class KairosProject extends PreviousKairosProject {
  async fetch(request) {
    const response = await handleCoverImageProductionObjectRequest(this.state, request, this.env);
    if (response) return stamp(response);
    return stamp(await super.fetch(request));
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await handleCoverImageProduction(request, env);
      if (response) return stamp(response);
      return stamp(await previousRuntime.fetch(request, env, ctx));
    } catch (caught) {
      return stamp(new Response(JSON.stringify({
        status: "failed",
        build: BUILD,
        error: {
          code: caught?.code || "cover_image_entry_failed",
          message: caught instanceof Error ? caught.message : "Cover image runtime failed.",
        },
      }), {
        status: Number(caught?.status || 500),
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      }));
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof previousRuntime.scheduled === "function") {
      return previousRuntime.scheduled(controller, env, ctx);
    }
  },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Cover-Entry", BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
