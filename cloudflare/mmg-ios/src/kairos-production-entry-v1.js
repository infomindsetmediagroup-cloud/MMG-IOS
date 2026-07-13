import runtime, { KairosProject } from "./kairos-native-publishing-worker-v1.js";
import { handleManuscriptConvergence } from "./kairos-manuscript-convergence-v1.js";
import { handleProductPublication } from "./kairos-product-publication-v1.js";
import { handleProductMedia } from "./kairos-product-media-v1.js";
import { handleProductLaunchControl } from "./kairos-product-launch-control-v1.js";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    const productLaunch = await handleProductLaunchControl(request, env);
    if (productLaunch) return productLaunch;
    const productMedia = await handleProductMedia(request, env);
    if (productMedia) return productMedia;
    const productPublication = await handleProductPublication(request, env);
    if (productPublication) return productPublication;
    const convergence = await handleManuscriptConvergence(request, env);
    if (convergence) return convergence;
    return runtime.fetch(request, env, ctx);
  },
};
