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
import { handleManuscriptPlatformSubmissionObjectRequest } from "./kairos-manuscript-platform-submission-v1.js";
import { handlePublicationCatalogObjectRequest } from "./kairos-publication-catalog-v1.js";
import { handlePublicationOperationsObjectRequest } from "./kairos-publication-operations-v1.js";
import { handlePublicationPerformanceObjectRequest } from "./kairos-publication-performance-v1.js";
import { handlePublicationSettlementObjectRequest } from "./kairos-publication-settlement-v1.js";
import { handlePublicationTaxComplianceObjectRequest } from "./kairos-publication-tax-compliance-v1.js";
import { handleWebsiteBuilderAssetObjectRequest } from "./kairos-website-builder-asset-library-v1.js";
import {
  handleProductManufacturingBridge,
  handleProductManufacturingBridgeObjectRequest,
} from "./kairos-product-manufacturing-bridge-v1.js";
import {
  handlePublishingPackage,
  handlePublishingPackageObjectRequest,
} from "./kairos-publishing-package-v1.js";
import {
  handlePublishingPackageControl,
  handlePublishingPackageControlObjectRequest,
} from "./kairos-package-assembly-v1.js";
import { handleDeliverableRunObjectRequest } from "./kairos-deliverable-runner-v1.js";
import { handleManuscriptRunObjectRequest } from "./kairos-manuscript-runner-v1.js";

export class KairosProject extends NativeKairosProject {
  async fetch(request) {
    const packageControl = await handlePublishingPackageControlObjectRequest(this.state, request, this.env);
    if (packageControl) return packageControl;
    const deliverableRun = await handleDeliverableRunObjectRequest(this.state, request, this.env);
    if (deliverableRun) return deliverableRun;
    const manuscriptRun = await handleManuscriptRunObjectRequest(this.state, request, this.env);
    if (manuscriptRun) return manuscriptRun;
    const publishingPackage = await handlePublishingPackageObjectRequest(this.state, request, this.env);
    if (publishingPackage) return publishingPackage;
    const productManufacturing = await handleProductManufacturingBridgeObjectRequest(this.state, request, this.env);
    if (productManufacturing) return productManufacturing;
    const websiteBuilderAsset = await handleWebsiteBuilderAssetObjectRequest(this.state, request);
    if (websiteBuilderAsset) return websiteBuilderAsset;
    const publicationTax = await handlePublicationTaxComplianceObjectRequest(this.state, request);
    if (publicationTax) return publicationTax;
    const publicationSettlement = await handlePublicationSettlementObjectRequest(this.state, request);
    if (publicationSettlement) return publicationSettlement;
    const publicationPerformance = await handlePublicationPerformanceObjectRequest(this.state, request);
    if (publicationPerformance) return publicationPerformance;
    const publicationOperations = await handlePublicationOperationsObjectRequest(this.state, request);
    if (publicationOperations) return publicationOperations;
    const publicationCatalog = await handlePublicationCatalogObjectRequest(this.state, request);
    if (publicationCatalog) return publicationCatalog;
    const platformSubmission = await handleManuscriptPlatformSubmissionObjectRequest(this.state, request);
    if (platformSubmission) return platformSubmission;
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
    const url = new URL(request.url);

    if ((request.method === "GET" || request.method === "HEAD") && !url.pathname.startsWith("/api/")) {
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return new Response("Kairos dashboard assets are unavailable.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("X-MMG-Static-Bypass", "production-entry-v1");
      if (headers.get("Content-Type")?.includes("text/html")) {
        headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const packageControl = await handlePublishingPackageControl(request, env);
    if (packageControl) return packageControl;
    const publishingPackage = await handlePublishingPackage(request, env);
    if (publishingPackage) return publishingPackage;
    const productManufacturing = await handleProductManufacturingBridge(request, env);
    if (productManufacturing) return productManufacturing;
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
