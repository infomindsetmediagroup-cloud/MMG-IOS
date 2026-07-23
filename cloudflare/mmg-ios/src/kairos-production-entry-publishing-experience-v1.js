import previousRuntime, { KairosProject } from "./kairos-production-entry-digital-asset-v2-v1.js";
import {
  handlePublishingExperience,
  KAIROS_PUBLISHING_EXPERIENCE_BUILD,
} from "./kairos-publishing-experience-v1.js";

const BUILD = "kairos-production-entry-publishing-experience-20260723-1";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const experience = await handlePublishingExperience(request.clone(), env);
    if (experience) return stamp(experience);
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
  headers.set("X-Kairos-Publishing-Experience", KAIROS_PUBLISHING_EXPERIENCE_BUILD);
  headers.set("X-Kairos-Publishing-Experience-Entry", BUILD);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
