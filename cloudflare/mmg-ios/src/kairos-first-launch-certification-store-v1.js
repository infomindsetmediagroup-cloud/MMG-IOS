export const KAIROS_FIRST_LAUNCH_CERTIFICATION_STORE_BUILD = "kairos-first-launch-certification-store-20260728-1";

export function createFirstLaunchCertificationStoreAdapter(storage) {
  return Object.freeze({
    async attachLaunchCertification(revenueProductId, certification) {
      if (!storage || !revenueProductId || !certification?.certified) return false;
      const product = await storage.getRevenueProduct?.(revenueProductId);
      if (!product) return false;
      if (product.launchCertification?.certified) return false;

      const next = Object.freeze({
        ...product,
        launchCertification: Object.freeze({ ...certification }),
        lifecycleState: "manual-shopify-review",
        automaticPublicationAllowed: false,
        updatedAt: new Date().toISOString(),
      });

      const persisted = await storage.putRevenueProduct?.(revenueProductId, next);
      if (!persisted) return false;

      await storage.appendRevenueEvent?.(revenueProductId, Object.freeze({
        type: "first-launch-certified",
        certificationBuild: certification.build || null,
        certifiedByIdentityHash: certification.certifiedByIdentityHash,
        certifiedByEmail: certification.certifiedByEmail,
        certifiedAt: certification.certifiedAt,
        nextState: "manual-shopify-review",
        automaticPublicationAllowed: false,
      }));
      return true;
    },
  });
}
