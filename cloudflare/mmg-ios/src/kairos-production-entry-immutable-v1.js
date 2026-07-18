import autonomousRuntime, { KairosProject } from "./kairos-production-entry-autonomous-v1.js";
import { handleImmutableApprovedFileExecution, KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD } from "./kairos-immutable-approved-file-execution-v1.js";
import { KAIROS_CANONICAL_HOMEPAGE_BUILD } from "./kairos-canonical-homepage-builder-v1.js";
import { handleCanonicalHomepageBuildWithCompatibility, KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD } from "./kairos-canonical-homepage-compatibility-v1.js";
import { handleCanonicalHomepageResilient, KAIROS_CANONICAL_HOMEPAGE_RESILIENT_BUILD } from "./kairos-canonical-homepage-publisher-resilient-20260718.js";
import { handleKairosExperienceRequest, KAIROS_EXPERIENCE_CONTROLLER_BUILD } from "./kairos-experience-controller-v1.js";
import { handleWebsiteBuilderV2Request, KAIROS_WEBSITE_BUILDER_V2_BUILD } from "./kairos-website-builder-v2.js";
import { KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD } from "./kairos-product-manufacturing-bridge-v1.js";
import { handleServicesLandingBuild, KAIROS_SERVICES_LANDING_BUILD } from "./kairos-services-landing-publisher-20260718.js";
import { handleMembershipLandingBuild, KAIROS_MEMBERSHIP_LANDING_BUILD } from "./kairos-membership-landing-publisher-20260718.js";
import { handleKnowledgeLandingBuild, KAIROS_KNOWLEDGE_LANDING_BUILD } from "./kairos-knowledge-landing-publisher-20260718.js";
import { handleCustomerPortalLandingBuild, KAIROS_CUSTOMER_PORTAL_LANDING_BUILD } from "./kairos-customer-portal-landing-publisher-20260718.js";
import { handleKairosLandingBuild, KAIROS_LANDING_BUILD } from "./kairos-landing-publisher-20260718.js";
import { handleProductsLandingBuild, KAIROS_PRODUCTS_LANDING_BUILD } from "./kairos-products-landing-publisher-20260718.js";
import { handleDigitalProductBuild, KAIROS_DIGITAL_PRODUCT_BUILD } from "./kairos-digital-product-publisher-20260718.js";
import { handleServiceProductBuild, KAIROS_SERVICE_PRODUCT_BUILD } from "./kairos-service-product-publisher-20260718.js";
import { handleRelatedProductsBuild, KAIROS_RELATED_PRODUCTS_BUILD } from "./kairos-related-products-publisher-20260718.js";
import { handleProductAssetViewerBuild, KAIROS_PRODUCT_ASSET_VIEWER_BUILD } from "./kairos-product-asset-viewer-publisher-20260718.js";
import { handleProductTrustLayerBuild, KAIROS_PRODUCT_TRUST_LAYER_BUILD } from "./kairos-product-trust-layer-publisher-20260718.js";
import { handleNativeNavigationPublish, KAIROS_NATIVE_NAVIGATION_BUILD } from "./kairos-native-navigation-theme-publisher-v8.js";

const BUILD = "kairos-production-entry-immutable-20260718-34";
const VISUAL_BASELINE = "verified-product-conversion-trust-layer-20260718";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const nativeNavigation = await handleNativeNavigationPublish(request, env);
      if (nativeNavigation) return stamp(nativeNavigation);
      const websiteBuilderV2 = await handleWebsiteBuilderV2Request(request, env);
      if (websiteBuilderV2) return stamp(websiteBuilderV2);
      const experience = await handleKairosExperienceRequest(request, env, ctx, delegatedRequest => autonomousRuntime.fetch(delegatedRequest, env, ctx));
      if (experience) return stamp(experience);
      const productTrustLayer = await handleProductTrustLayerBuild(request, env);
      if (productTrustLayer) return stamp(productTrustLayer);
      const productAssetViewer = await handleProductAssetViewerBuild(request, env);
      if (productAssetViewer) return stamp(productAssetViewer);
      const relatedProducts = await handleRelatedProductsBuild(request, env);
      if (relatedProducts) return stamp(relatedProducts);
      const serviceProduct = await handleServiceProductBuild(request, env);
      if (serviceProduct) return stamp(serviceProduct);
      const digitalProduct = await handleDigitalProductBuild(request, env);
      if (digitalProduct) return stamp(digitalProduct);
      const productsLanding = await handleProductsLandingBuild(request, env);
      if (productsLanding) return stamp(productsLanding);
      const kairosLanding = await handleKairosLandingBuild(request, env);
      if (kairosLanding) return stamp(kairosLanding);
      const customerPortalLanding = await handleCustomerPortalLandingBuild(request, env);
      if (customerPortalLanding) return stamp(customerPortalLanding);
      const knowledgeLanding = await handleKnowledgeLandingBuild(request, env);
      if (knowledgeLanding) return stamp(knowledgeLanding);
      const membershipLanding = await handleMembershipLandingBuild(request, env);
      if (membershipLanding) return stamp(membershipLanding);
      const servicesLanding = await handleServicesLandingBuild(request, env);
      if (servicesLanding) return stamp(servicesLanding);
      const resilientHomepage = await handleCanonicalHomepageResilient(request, env);
      if (resilientHomepage) return stamp(resilientHomepage);
      const canonicalHomepage = await handleCanonicalHomepageBuildWithCompatibility(request, env, ctx);
      if (canonicalHomepage) return stamp(canonicalHomepage);
      const immutableExecution = await handleImmutableApprovedFileExecution(request, env, ctx);
      if (immutableExecution) return stamp(immutableExecution);
      return stamp(await autonomousRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({
        status: "failed", build: BUILD,
        nativeNavigation: KAIROS_NATIVE_NAVIGATION_BUILD,
        websiteBuilderV2: KAIROS_WEBSITE_BUILDER_V2_BUILD,
        productManufacturingBridge: KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
        experienceController: KAIROS_EXPERIENCE_CONTROLLER_BUILD,
        productTrustLayer: KAIROS_PRODUCT_TRUST_LAYER_BUILD,
        productAssetViewer: KAIROS_PRODUCT_ASSET_VIEWER_BUILD,
        relatedProducts: KAIROS_RELATED_PRODUCTS_BUILD,
        serviceProduct: KAIROS_SERVICE_PRODUCT_BUILD,
        digitalProduct: KAIROS_DIGITAL_PRODUCT_BUILD,
        productsLanding: KAIROS_PRODUCTS_LANDING_BUILD,
        kairosLanding: KAIROS_LANDING_BUILD,
        customerPortalLanding: KAIROS_CUSTOMER_PORTAL_LANDING_BUILD,
        knowledgeLanding: KAIROS_KNOWLEDGE_LANDING_BUILD,
        membershipLanding: KAIROS_MEMBERSHIP_LANDING_BUILD,
        servicesLanding: KAIROS_SERVICES_LANDING_BUILD,
        canonicalHomepage: KAIROS_CANONICAL_HOMEPAGE_BUILD,
        canonicalHomepageResilient: KAIROS_CANONICAL_HOMEPAGE_RESILIENT_BUILD,
        canonicalHomepageCompatibility: KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD,
        immutableExecution: KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
        error: { code: error?.code || "immutable_entry_failed", message: error instanceof Error ? error.message : "Kairos could not complete this request." },
        safeguards: {
          liveThemeChanged: false,
          nativeShopifyNavigationRequired: true,
          duplicateStandaloneNavigationPrevented: true,
          landingPagesRequiredBeforeNavigationPublish: true,
          productTrustLayerStagingRequiredBeforePublish: true,
          fabricatedReviewsPrevented: true,
          deliveryAndEligibilityDisclosuresRequired: true,
          cartContinuityEnabled: true,
          firstPartyAnalyticsEventsEnabled: true,
          analyticsProviderAgnostic: true,
          productAssetViewerStagingRequiredBeforePublish: true,
          accessibleMediaControlsRequired: true,
          keyboardAndSwipeNavigationEnabled: true,
          inactiveVideoPlaybackPrevented: true,
          approvedSamplePdfSupported: true,
          relatedProductsStagingRequiredBeforePublish: true,
          currentProductRecommendationExcluded: true,
          duplicateRecommendationsExcluded: true,
          metafieldRecommendationOverridesSupported: true,
          collectionAwareFallbackEnabled: true,
          serviceProductStagingRequiredBeforePublish: true,
          multiVariantServiceArchitectureVerified: true,
          shopifyPricingAuthoritative: true,
          digitalProductStagingRequiredBeforePublish: true,
          singleVariantProductArchitectureVerified: true,
          productDataDrivenRenderingRequired: true,
          productsLandingStagingRequiredBeforePublish: true,
          productDiscoveryArchitectureVerified: true,
          kairosLandingStagingRequiredBeforePublish: true,
          publicCapabilityClaimsBounded: true,
          customerPortalLandingStagingRequiredBeforePublish: true,
          authenticatedWorkspaceEntryOnly: true,
          knowledgeLandingStagingRequiredBeforePublish: true,
          membershipLandingStagingRequiredBeforePublish: true,
          servicesLandingStagingRequiredBeforePublish: true,
          immutableApprovedCandidateRequired: true,
          approvalTimeTextReconstruction: false,
          exactSourceHashRequired: true,
          authorizedDiffRequired: true,
          exactShopifyReadBackRequired: true,
          workersAIUsed: false,
          neuronsConsumed: 0,
        },
      }, Number(error?.status || error?.statusCode || 500));
    }
  },
  async scheduled(controller, env, ctx) {
    if (typeof autonomousRuntime.scheduled === "function") return autonomousRuntime.scheduled(controller, env, ctx);
  },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  Object.entries(runtimeHeaders()).forEach(([key, value]) => headers.set(key, value));
  if (headers.get("Content-Type")?.includes("text/html")) headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function runtimeHeaders() {
  return {
    "X-MMG-Production-Entry": BUILD,
    "X-MMG-Native-Navigation": KAIROS_NATIVE_NAVIGATION_BUILD,
    "X-MMG-Website-Builder-V2": KAIROS_WEBSITE_BUILDER_V2_BUILD,
    "X-Kairos-Product-Manufacturing": KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
    "X-MMG-Experience-Controller": KAIROS_EXPERIENCE_CONTROLLER_BUILD,
    "X-MMG-Product-Trust-Layer": KAIROS_PRODUCT_TRUST_LAYER_BUILD,
    "X-MMG-Product-Asset-Viewer": KAIROS_PRODUCT_ASSET_VIEWER_BUILD,
    "X-MMG-Related-Products": KAIROS_RELATED_PRODUCTS_BUILD,
    "X-MMG-Service-Product": KAIROS_SERVICE_PRODUCT_BUILD,
    "X-MMG-Digital-Product": KAIROS_DIGITAL_PRODUCT_BUILD,
    "X-MMG-Products-Landing": KAIROS_PRODUCTS_LANDING_BUILD,
    "X-MMG-Kairos-Landing": KAIROS_LANDING_BUILD,
    "X-MMG-Customer-Portal-Landing": KAIROS_CUSTOMER_PORTAL_LANDING_BUILD,
    "X-MMG-Knowledge-Landing": KAIROS_KNOWLEDGE_LANDING_BUILD,
    "X-MMG-Membership-Landing": KAIROS_MEMBERSHIP_LANDING_BUILD,
    "X-MMG-Services-Landing": KAIROS_SERVICES_LANDING_BUILD,
    "X-Kairos-Canonical-Homepage": KAIROS_CANONICAL_HOMEPAGE_BUILD,
    "X-Kairos-Canonical-Homepage-Resilient": KAIROS_CANONICAL_HOMEPAGE_RESILIENT_BUILD,
    "X-Kairos-Canonical-Homepage-Compatibility": KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD,
    "X-Kairos-Immutable-Approved-File-Execution": KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
    "X-Kairos-Approval-Time-Reconstruction": "false",
    "X-Kairos-Workers-AI-Used": "false",
    "X-Kairos-Neurons-Consumed": "0",
    "X-Kairos-Visual-Baseline": VISUAL_BASELINE,
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...runtimeHeaders(), "X-Content-Type-Options": "nosniff" } });
}
