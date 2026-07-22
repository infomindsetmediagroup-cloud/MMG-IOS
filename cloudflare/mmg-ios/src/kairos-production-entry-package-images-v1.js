import previousRuntime, { KairosProject as PreviousKairosProject } from "./kairos-production-entry-cover-images-v1.js";
import { handlePackageImageIntegrationObjectRequest } from "./kairos-package-image-integration-v1.js";

const BUILD = "kairos-production-entry-package-images-20260722-1";

export class KairosProject extends PreviousKairosProject {
  async fetch(request) {
    const response = await handlePackageImageIntegrationObjectRequest(this.state, request, this.env);
    if (response) return stamp(response);
    return stamp(await super.fetch(request));
  }
}

export default {
  async fetch(request, env, ctx) {
    return stamp(await previousRuntime.fetch(request, env, ctx));
  },
  async scheduled(controller, env, ctx) {
    if (typeof previousRuntime.scheduled === "function") {
      return previousRuntime.scheduled(controller, env, ctx);
    }
  },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Kairos-Package-Images-Entry", BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
