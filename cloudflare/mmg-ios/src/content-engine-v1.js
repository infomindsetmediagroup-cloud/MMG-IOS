import { intelligenceConfigured, parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

const MAX_OBJECTIVE_CHARS = 12000;
const TYPES = new Set(["social_content", "product_asset_copy", "book_package"]);

export async function handleContentEngineRequest(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/content/capabilities" && request.method === "GET") {
    return json({
      status: intelligenceConfigured(env) ? "ready" : "needs-configuration",
      version: "content-engine-v1",
      intelligenceRuntime: "kairos-private-runtime",
      intelligenceConfigured: intelligenceConfigured(env),
      supportedTypes: [...TYPES],
      mediaGeneration: { image: "not-enabled", video: "not-enabled", audio: "not-enabled" },
      productionActions: { websiteRetool: "available-through-governed-shopify-workflow", productAssetCopy: "available", socialContent: "available", bookDevelopment: "available" },
    });
  }

  if (url.pathname === "/api/content/generate" && request.method === "POST") {
    if (!intelligenceConfigured(env)) return json({ status: "blocked", error: { code: "kairos_inference_not_configured", message: "Kairos private intelligence runtime must be connected before content generation can run." } }, 503);

    const body = await request.json();
    const type = String(body?.type || "").trim();
    const objective = String(body?.objective || "").trim();
    if (!TYPES.has(type)) return json({ status: "needs-input", error: { code: "unsupported_content_type", message: "Choose social_content, product_asset_copy, or book_package." } }, 400);
    if (objective.length < 3) return json({ status: "needs-input", error: { code: "objective_required", message: "Describe what Kairos should create." } }, 400);
    if (objective.length > MAX_OBJECTIVE_CHARS) return json({ status: "needs-input", error: { code: "objective_too_large", message: `Objectives are limited to ${MAX_OBJECTIVE_CHARS.toLocaleString()} characters.` } }, 413);

    const prompt = buildPrompt(type, objective, body?.context);
    const inference = await runKairosIntelligence(env, { system: prompt.system, user: prompt.user, temperature: prompt.temperature, maxTokens: prompt.maxTokens });
    const result = parseStrictJSON(inference.text);

    return json({
      status: "customer_review",
      workItemID: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      type,
      objective,
      intelligence: { provider: inference.provider, model: inference.model },
      result,
      approvalRequired: true,
      externalActionTaken: false,
    });
  }

  return null;
}

function buildPrompt(type, objective, context) {
  const shared = "You are Kairos, the private intelligence operating system for Mindset Media Group. Follow MMG doctrine: Your Knowledge Has Value; we are door openers, not gatekeepers; prioritize clarity, practical value, integrity, reusable assets, visible progress, customer empowerment, and long-term ecosystem value. Do not invent facts, results, testimonials, product capabilities, links, customer data, or claims. Return strict JSON only.";
  const safeContext = typeof context === "string" ? context.slice(0, 12000) : JSON.stringify(context || {}).slice(0, 12000);

  if (type === "social_content") return {
    system: `${shared} Create a complete social content production package for TikTok and Facebook. Return keys: summary, audience, strategy, tiktokPosts, facebookPosts, productionAssets, repurposingPlan, qualityChecks, nextAction. Each TikTok post must include title, hook, script, shotList, caption, five lowercase hashtags, callToAction, and estimatedLength. Each Facebook post must include postCopy, visualBrief, callToAction, and repurposingSource. Respect the MMG five-hashtag Pyramid Mix and avoid claiming image or video generation occurred.`,
    user: `OBJECTIVE:\n${objective}\n\nAVAILABLE CONTEXT:\n${safeContext}`,
    temperature: 0.6,
    maxTokens: 12000,
  };

  if (type === "product_asset_copy") return {
    system: `${shared} Create a governed product asset and website copy package. Return keys: summary, positioning, productPage, landingPage, seo, visualAssetBriefs, socialLaunchAssets, complianceChecks, implementationNotes, nextAction. productPage must include headline, subheadline, benefits, features, proofRequirements, offer, faq, callsToAction. visualAssetBriefs are instructions for customer-supplied or future generated assets; do not claim visual files were created. Make the package ready for the existing governed Shopify website retool workflow.`,
    user: `PRODUCT OR WEBSITE OBJECTIVE:\n${objective}\n\nAVAILABLE CONTEXT:\n${safeContext}`,
    temperature: 0.4,
    maxTokens: 12000,
  };

  return {
    system: `${shared} Create a publication-ready book development package. Return keys: titleOptions, recommendedTitle, subtitle, targetReader, promise, positioning, tableOfContents, chapterBlueprints, frontMatterPlan, backMatterPlan, researchRequirements, manuscriptInstructions, sampleIntroduction, productionChecklist, kdpReadinessPlan, nextAction. Do not fabricate sources. Clearly mark where research or fact verification is required. This endpoint creates the governed book package; full manuscript drafting should proceed chapter by chapter through approved work items to preserve quality and reviewability.`,
    user: `BOOK OBJECTIVE:\n${objective}\n\nAVAILABLE CONTEXT:\n${safeContext}`,
    temperature: 0.5,
    maxTokens: 14000,
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
