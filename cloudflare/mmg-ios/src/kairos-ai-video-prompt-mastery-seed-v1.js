export const KAIROS_AI_VIDEO_PROMPT_MASTERY_SEED_BUILD = "kairos-ai-video-prompt-mastery-seed-20260728-1";

export function createAIVideoPromptMasterySeed(input = {}) {
  const price = Number.isFinite(Number(input.price)) ? Number(input.price) : 29;
  return Object.freeze({
    revenueProductId: clean(input.revenueProductId, 180) || "ai-video-prompt-mastery-v1",
    projectId: clean(input.projectId, 180) || "mmg-ai-video-prompt-mastery",
    productType: "digital-guide",
    title: "AI Video Prompt Mastery",
    audience: "Creators, entrepreneurs, and small brands producing commercial short-form video with AI.",
    objective: "Create a practical, commercially usable system for planning, prompting, producing, and improving AI video content.",
    price,
    currency: "USD",
    requiredAssets: Object.freeze([
      "manuscript",
      "prompt-library",
      "workbook",
      "cover",
      "product-image",
      "digital-edition",
      "editable-source",
      "complete-package"
    ]),
    shopify: Object.freeze({
      title: "AI Video Prompt Mastery",
      handle: "ai-video-prompt-mastery",
      vendor: "Mindset Media Group",
      productType: "Digital Guide",
      tags: Object.freeze(["AI Video", "Prompt Engineering", "Creator Education", "Digital Guide", "Mindset Media Group"]),
      collections: Object.freeze(["Knowledge Library", "AI Creator Education"]),
      seo: Object.freeze({
        title: "AI Video Prompt Mastery | Mindset Media Group",
        description: "Build stronger AI video prompts, production systems, and repeatable creator workflows with a practical commercial guide."
      })
    }),
    productionPolicy: Object.freeze({
      editorialQARequired: true,
      visualQARequired: true,
      shopifyStatus: "DRAFT",
      automaticPublicationAllowed: false,
      commerceMutationRequiresExplicitApproval: true
    }),
    build: KAIROS_AI_VIDEO_PROMPT_MASTERY_SEED_BUILD
  });
}

function clean(value, max) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}
