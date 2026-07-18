import autonomousRuntime, { KairosProject } from "./kairos-production-entry-autonomous-v1.js";
import {
  handleImmutableApprovedFileExecution,
  KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
} from "./kairos-immutable-approved-file-execution-v1.js";
import { KAIROS_CANONICAL_HOMEPAGE_BUILD } from "./kairos-canonical-homepage-builder-v1.js";
import {
  handleCanonicalHomepageBuildWithCompatibility,
  KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD,
} from "./kairos-canonical-homepage-compatibility-v1.js";
import {
  handleKairosExperienceRequest,
  KAIROS_EXPERIENCE_CONTROLLER_BUILD,
} from "./kairos-experience-controller-v1.js";
import {
  handleWebsiteBuilderV2Request,
  KAIROS_WEBSITE_BUILDER_V2_BUILD,
} from "./kairos-website-builder-v2.js";
import { KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD } from "./kairos-product-manufacturing-bridge-v1.js";
import {
  handleServicesLandingBuild,
  KAIROS_SERVICES_LANDING_BUILD,
} from "./kairos-services-landing-publisher-20260718.js";
import {
  handleMembershipLandingBuild,
  KAIROS_MEMBERSHIP_LANDING_BUILD,
} from "./kairos-membership-landing-publisher-20260718.js";
import {
  handleKnowledgeLandingBuild,
  KAIROS_KNOWLEDGE_LANDING_BUILD,
} from "./kairos-knowledge-landing-publisher-20260718.js";
import {
  handleCustomerPortalLandingBuild,
  KAIROS_CUSTOMER_PORTAL_LANDING_BUILD,
} from "./kairos-customer-portal-landing-publisher-20260718.js";
import {
  handleKairosLandingBuild,
  KAIROS_LANDING_BUILD,
} from "./kairos-landing-publisher-20260718.js";
import {
  handleProductsLandingBuild,
  KAIROS_PRODUCTS_LANDING_BUILD,
} from "./kairos-products-landing-publisher-20260718.js";
import {
  handleDigitalProductBuild,
  KAIROS_DIGITAL_PRODUCT_BUILD,
} from "./kairos-digital-product-publisher-20260718.js";

const BUILD = "kairos-production-entry-immutable-20260718-25";
const VISUAL_BASELINE = "verified-single-variant-digital-product-20260718";

export { KairosProject };

export default {
  async fetch(request, env, ctx) {
    try {
      const websiteBuilderV2 = await handleWebsiteBuilderV2Request(request, env);
      if (websiteBuilderV2) return stamp(websiteBuilderV2);
      const experience = await handleKairosExperienceRequest(
        request,
        env,
        ctx,
        delegatedRequest => autonomousRuntime.fetch(delegatedRequest, env, ctx),
      );
      if (experience) return stamp(experience);
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
      const canonicalHomepage = await handleCanonicalHomepageBuildWithCompatibility(request, env, ctx);
      if (canonicalHomepage) return stamp(canonicalHomepage);
      const immutableExecution = await handleImmutableApprovedFileExecution(request, env, ctx);
      if (immutableExecution) return stamp(immutableExecution);
      return stamp(await autonomousRuntime.fetch(request, env, ctx));
    } catch (error) {
      return json({
        status: "failed",
        build: BUILD,
        websiteBuilderV2: KAIROS_WEBSITE_BUILDER_V2_BUILD,
        productManufacturingBridge: KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
        experienceController: KAIROS_EXPERIENCE_CONTROLLER_BUILD,
        digitalProduct: KAIROS_DIGITAL_PRODUCT_BUILD,
        productsLanding: KAIROS_PRODUCTS_LANDING_BUILD,
        kairosLanding: KAIROS_LANDING_BUILD,
        customerPortalLanding: KAIROS_CUSTOMER_PORTAL_LANDING_BUILD,
        knowledgeLanding: KAIROS_KNOWLEDGE_LANDING_BUILD,
        membershipLanding: KAIROS_MEMBERSHIP_LANDING_BUILD,
        servicesLanding: KAIROS_SERVICES_LANDING_BUILD,
        canonicalHomepage: KAIROS_CANONICAL_HOMEPAGE_BUILD,
        canonicalHomepageCompatibility: KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD,
        immutableExecution: KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
        error: {
          code: error?.code || "immutable_entry_failed",
          message: error instanceof Error ? error.message : "Kairos could not complete this request.",
        },
        safeguards: {
          liveThemeChanged: false,
          websiteBuilderStagingOnly: true,
          websiteAssetLibraryPersistent: true,
          authoritativeManuscriptPreservationRequired: true,
          productPublicationDraftFirst: true,
          canonicalHomepageStagingOnly: false,
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
    if (typeof autonomousRuntime.scheduled === "function") {
      return autonomousRuntime.scheduled(controller, env, ctx);
    }
  },
};

function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("X-MMG-Production-Entry", BUILD);
  headers.set("X-MMG-Website-Builder-V2", KAIROS_WEBSITE_BUILDER_V2_BUILD);
  headers.set("X-Kairos-Product-Manufacturing", KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD);
  headers.set("X-MMG-Experience-Controller", KAIROS_EXPERIENCE_CONTROLLER_BUILD);
  headers.set("X-MMG-Digital-Product", KAIROS_DIGITAL_PRODUCT_BUILD);
  headers.set("X-MMG-Products-Landing", KAIROS_PRODUCTS_LANDING_BUILD);
  headers.set("X-MMG-Kairos-Landing", KAIROS_LANDING_BUILD);
  headers.set("X-MMG-Customer-Portal-Landing", KAIROS_CUSTOMER_PORTAL_LANDING_BUILD);
  headers.set("X-MMG-Knowledge-Landing", KAIROS_KNOWLEDGE_LANDING_BUILD);
  headers.set("X-MMG-Membership-Landing", KAIROS_MEMBERSHIP_LANDING_BUILD);
  headers.set("X-MMG-Services-Landing", KAIROS_SERVICES_LANDING_BUILD);
  headers.set("X-Kairos-Canonical-Homepage", KAIROS_CANONICAL_HOMEPAGE_BUILD);
  headers.set("X-Kairos-Canonical-Homepage-Compatibility", KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD);
  headers.set("X-Kairos-Immutable-Approved-File-Execution", KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD);
  headers.set("X-Kairos-Approval-Time-Reconstruction", "false");
  headers.set("X-Kairos-Workers-AI-Used", "false");
  headers.set("X-Kairos-Neurons-Consumed", "0");
  headers.set("X-Kairos-Visual-Baseline", VISUAL_BASELINE);
  if (headers.get("Content-Type")?.includes("text/html")) {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Production-Entry": BUILD,
      "X-MMG-Website-Builder-V2": KAIROS_WEBSITE_BUILDER_V2_BUILD,
      "X-Kairos-Product-Manufacturing": KAIROS_PRODUCT_MANUFACTURING_BRIDGE_BUILD,
      "X-MMG-Experience-Controller": KAIROS_EXPERIENCE_CONTROLLER_BUILD,
      "X-MMG-Digital-Product": KAIROS_DIGITAL_PRODUCT_BUILD,
      "X-MMG-Products-Landing": KAIROS_PRODUCTS_LANDING_BUILD,
      "X-MMG-Kairos-Landing": KAIROS_LANDING_BUILD,
      "X-MMG-Customer-Portal-Landing": KAIROS_CUSTOMER_PORTAL_LANDING_BUILD,
      "X-MMG-Knowledge-Landing": KAIROS_KNOWLEDGE_LANDING_BUILD,
      "X-MMG-Membership-Landing": KAIROS_MEMBERSHIP_LANDING_BUILD,
      "X-MMG-Services-Landing": KAIROS_SERVICES_LANDING_BUILD,
      "X-Kairos-Canonical-Homepage": KAIROS_CANONICAL_HOMEPAGE_BUILD,
      "X-Kairos-Canonical-Homepage-Compatibility": KAIROS_CANONICAL_HOMEPAGE_COMPATIBILITY_BUILD,
      "X-Kairos-Immutable-Approved-File-Execution": KAIROS_IMMUTABLE_APPROVED_FILE_EXECUTION_BUILD,
      "X-Kairos-Approval-Time-Reconstruction": "false",
      "X-Kairos-Workers-AI-Used": "false",
      "X-Kairos-Neurons-Consumed": "0",
      "X-Kairos-Visual-Baseline": VISUAL_BASELINE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
