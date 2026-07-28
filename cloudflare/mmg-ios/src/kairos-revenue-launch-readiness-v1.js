export const KAIROS_REVENUE_LAUNCH_READINESS_BUILD = "kairos-revenue-launch-readiness-20260728-1";

export function certifyKairosRevenueLaunchReadiness(product = {}, input = {}) {
  const checks = Object.freeze([
    check("product_approved", product.approval?.status === "approved", "Revenue product requires operator approval."),
    check("production_complete", (product.productionJobs || []).length > 0 && (product.productionJobs || []).every((job) => job.state === "completed"), "Every production job must complete."),
    check("assets_present", (product.assets || []).length > 0, "At least one revenue asset is required."),
    check("assets_qa_approved", (product.assets || []).length > 0 && (product.assets || []).every((asset) => asset.editorialQAStatus === "approved"), "Every asset must pass editorial QA."),
    check("delivery_package_ready", product.deliveryPackage?.status === "stored_awaiting_editorial_qa" && (product.deliveryPackage?.assets || []).length >= 3, "PDF, DOCX, and ZIP delivery assets are required."),
    check("shopify_handoff_received", product.shopifyDraftReceiver?.status === "received_pending_shopify_draft_creation", "Governed Shopify handoff must be received."),
    check("shopify_draft_created", product.shopifyDraftReceipt?.productRemainsDraft === true && Boolean(product.shopifyDraftReceipt?.shopifyProductId), "A Shopify draft product must exist."),
    check("publication_disabled", product.automaticPublicationAllowed !== true, "Automatic publication must remain disabled."),
  ]);
  const blockers = checks.filter((item) => !item.passed).map((item) => item.message);
  const ready = blockers.length === 0;
  return Object.freeze({
    certificationId: `revenue_launch_${fnv1a(`${product.revenueProductId}:${checks.map((item) => item.passed).join("")}`)}`,
    revenueProductId: clean(product.revenueProductId, 180),
    status: ready ? "ready_for_manual_shopify_review" : "blocked",
    ready,
    checks,
    blockers: Object.freeze(blockers),
    certifiedByIdentityHash: clean(input.operatorIdentityHash, 180) || null,
    certifiedAt: new Date().toISOString(),
    publicationAuthorizationIncluded: false,
    build: KAIROS_REVENUE_LAUNCH_READINESS_BUILD,
  });
}

export function attachKairosRevenueLaunchCertification(product = {}, certification = {}) {
  if (certification.revenueProductId !== product.revenueProductId) throw readinessError("REVENUE_LAUNCH_CERTIFICATION_INVALID", "Launch certification does not match the revenue product.");
  return Object.freeze({ ...product, launchCertification: certification, state: certification.ready ? "ready_for_manual_shopify_review" : product.state, updatedAt: new Date().toISOString(), automaticPublicationAllowed: false });
}

function check(id, passed, message) { return Object.freeze({ id, passed: Boolean(passed), message }); }
function fnv1a(value){let hash=2166136261;for(const char of String(value))hash=Math.imul(hash^char.charCodeAt(0),16777619);return(hash>>>0).toString(16).padStart(8,"0");}
function clean(value,max){return String(value||"").replace(/\u0000/g,"").trim().slice(0,max);}
function readinessError(code,message,status=400){const error=new Error(message);error.code=code;error.status=status;return error;}
