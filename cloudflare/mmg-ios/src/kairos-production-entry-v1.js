import runtime, { KairosProject as NativeKairosProject } from "./kairos-native-publishing-worker-v1.js";
import { handleManuscriptConvergence } from "./kairos-manuscript-convergence-v1.js";
import { handleProductPublication } from "./kairos-product-publication-v1.js";
import { handleProductMedia } from "./kairos-product-media-v1.js";
import { handleProductLaunchControl } from "./kairos-product-launch-control-v1.js";
import { handleProductionRegistry, handleRegistryObjectRequest } from "./kairos-production-registry-v1.js";
import { handleManuscriptSourceObjectRequest } from "./kairos-manuscript-source-v1.js";
import { handleManuscriptProjectSetupObjectRequest } from "./kairos-manuscript-project-setup-v1.js";
import { handleManuscriptEditorialObjectRequest } from "./kairos-manuscript-editorial-workbench-v1.js";
import { handleManuscriptManufacturingObjectRequest } from "./kairos-manuscript-manufacturing-v1.js";
import { handleManuscriptDeliveryObjectRequest } from "./kairos-manuscript-delivery-v1.js";

export class KairosProject extends NativeKairosProject {
  async fetch(request) {
    const delivery = await handleManuscriptDeliveryObjectRequest(this.state, request);
    if (delivery) return delivery;
    const manufacturing = await handleManuscriptManufacturingObjectRequest(this.state, request);
    if (manufacturing) return manufacturing;
    const editorial = await handleManuscriptEditorialObjectRequest(this.state, request);
    if (editorial) return editorial;
    const manuscriptSetup = await handleManuscriptProjectSetupObjectRequest(this.state, request);
    if (manuscriptSetup) return manuscriptSetup;
    const manuscriptSource = await handleManuscriptSourceObjectRequest(this.state, request);
    if (manuscriptSource) return manuscriptSource;
    const registry = await handleRegistryObjectRequest(this.state, request);
    if (registry) return registry;
    return super.fetch(request);
  }
}

export default {
  async fetch(request, env, ctx) {
    const registry = await handleProductionRegistry(request, env);
    if (registry) return registry;
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
