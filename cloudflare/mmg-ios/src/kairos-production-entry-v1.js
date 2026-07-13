import runtime, { KairosProject } from "./kairos-native-publishing-worker-v1.js";
import { handleManuscriptConvergence } from "./kairos-manuscript-convergence-v1.js";
import { handleProductPublication } from "./kairos-product-publication-v1.js";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const productPublication = await handleProductPublication(request, env);
    if (productPublication) return productPublication;
    const convergence = await handleManuscriptConvergence(request, env);
    if (convergence) return convergence;
    return runtime.fetch(request, env, ctx);
  },
};
