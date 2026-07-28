import { describe, expect, it } from "vitest";
import { createAIVideoPromptMasterySeed } from "../cloudflare/mmg-ios/src/kairos-ai-video-prompt-mastery-seed-v1.js";
import { createFirstRevenueRun, validateRevenueRunProgress } from "../cloudflare/mmg-ios/src/kairos-first-revenue-run-v1.js";

describe("Kairos first revenue product run", () => {
  it("creates the canonical AI Video Prompt Mastery seed", () => {
    const seed = createAIVideoPromptMasterySeed({ price: 29 });
    expect(seed.title).toBe("AI Video Prompt Mastery");
    expect(seed.currency).toBe("USD");
    expect(seed.requiredAssets).toContain("complete-package");
    expect(seed.shopify.handle).toBe("ai-video-prompt-mastery");
    expect(seed.productionPolicy.shopifyStatus).toBe("DRAFT");
    expect(seed.productionPolicy.automaticPublicationAllowed).toBe(false);
  });

  it("creates a dependency-ordered revenue run after exact confirmation", () => {
    const run = createFirstRevenueRun({ confirmation: "START FIRST REVENUE RUN" });
    expect(run.status).toBe("planned_awaiting_operator_execution");
    expect(run.stages.map((stage) => stage.id)).toEqual([
      "create-product",
      "plan-production",
      "execute-content",
      "execute-visuals",
      "editorial-qa",
      "visual-qa",
      "build-package",
      "package-qa",
      "shopify-handoff",
      "create-shopify-draft",
      "certify-launch"
    ]);
    expect(run.automaticPublicationAllowed).toBe(false);
  });

  it("blocks an out-of-order stage until dependencies complete", () => {
    const run = createFirstRevenueRun({ confirmation: "START FIRST REVENUE RUN" });
    const progress = validateRevenueRunProgress(run, ["create-product"]);
    expect(progress.nextStage?.id).toBe("plan-production");
    expect(progress.blockers).toEqual([]);
  });

  it("requires the exact run confirmation", () => {
    expect(() => createFirstRevenueRun({})).toThrow(/START FIRST REVENUE RUN/);
  });
});
