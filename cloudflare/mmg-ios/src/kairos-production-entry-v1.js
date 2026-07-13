import runtime, { KairosProject } from "./kairos-native-publishing-worker-v1.js";
import { handleManuscriptConvergence } from "./kairos-manuscript-convergence-v1.js";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const response = await handleManuscriptConvergence(request, env);
    if (response) return response;
    return runtime.fetch(request, env, ctx);
  },
};
