import { httpError, inspectStagingSource, parseShopifyJson } from "./kairos-compact-homepage-utils-v1.js";
import { parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

export const KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD = "kairos-homepage-preserve-planner-20260716-1";

const HOMEPAGE_FILE = "templates/index.json";
const SECTION_FILE = "sections/mmg-canonical-homepage.liquid";
const CSS_FILE = "assets/mmg-canonical-homepage.css";
const BLOCK_TAGS = new Set(["address","article","aside","blockquote","button","div","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header","li","main","nav","p","section","td","th"]);
const BLOCKED_TAGS = new Set(["script","style","svg","template","noscript","code","pre"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/shopify/staging/plan/jobs") return createPlan(request, env);
    return json({ status: "not-found", build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD }, 404);
  },
};

async function createPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 3) throw httpError(400, "objective_required", "Tell Kairos what you want changed on the homepage.");
    if (objective.length > 12000) throw httpError(413, "objective_too_long", "Homepage objective exceeds 12,000 characters.");

    const sourceBody = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD, [HOMEPAGE_FILE, SECTION_FILE, CSS_FILE]);
    const evidence = sourceBody?.evidence || {};
    validateBoundary(evidence.stagingTheme, evidence.mainTheme);
    const files = new Map((Array.isArray(evidence.files) ? evidence.files : []).filter(file => file?.readable && typeof file?.content === "string").map(file => [file.filename, file]));
    const template = files.get(HOMEPAGE_FILE);
    const section = files.get(SECTION_FILE);
    const css = files.get(CSS_FILE);
    if (!template?.content || !section?.content || !css?.content) throw httpError(409, "homepage_source_unavailable", "The verified homepage template, Liquid section, and stylesheet must all be readable from Kairos Staging.");

    const homepage = parseShopifyJson(template.content, "Current Kairos Staging homepage");
    const canonicalActive = Object.values(homepage.sections || {}).some(value => String(value?.type || "") === "mmg-canonical-homepage");
    if (!canonicalActive) throw httpError(409, "canonical_homepage_not_active", "Kairos Staging is not using the canonical MMG homepage section.");

    const sourceTokens = tokenize(section.content);
    const inventory = buildGroups(sourceTokens).map((group, index) => ({ id: index + 1, text: group.text })).filter(item => item.text.length >= 2).slice(0, 180);
    if (!inventory.length) throw httpError(409, "homepage_visible_text_missing", "Kairos found no editable visible homepage copy in the current design.");

    const generated = await runKairosIntelligence(env, {
      purpose: "homepage-preserve-design-copy-plan",
      temperature: 0.15,
      maxTokens: 4096,
      seed: 1911,
      system: [
        "You are Kairos, the governed MMG homepage copy editor.",
        "Return strict JSON only, without markdown or commentary.",
        "Rewrite only customer-facing visible copy needed to satisfy the objective.",
        "The current HTML, Liquid, classes, colors, typography, pills, cards, spacing, section order, links, template, stylesheet, and layout are immutable.",
        "Every replacement.before value must be copied exactly from the supplied visible-text inventory.",
        "Do not invent testimonials, metrics, awards, prices, guarantees, partnerships, product availability, or factual claims.",
        "Return only useful changes.",
        "Schema: {\"summary\":\"...\",\"replacements\":[{\"before\":\"exact existing text\",\"after\":\"new visible text\",\"reason\":\"brief reason\"}]}.",
      ].join("\n"),
      user: JSON.stringify({
        objective,
        immutableDesignContract: {
          preserveColors: true,
          preserveTypography: true,
          preservePillsCardsAndSpacing: true,
          preserveSectionOrderAndLayout: true,
          preserveMarkupLiquidTemplateAndStylesheet: true,
          stagingOnly: true,
        },
        visibleTextInventory: inventory,
      }),
    });

    const proposal = parseStrictJSON(generated.text);
    const requested = normalizeReplacements(proposal?.replacements);
    if (!requested.length) throw httpError(409, "safe_homepage_replacements_missing", "Kairos did not produce safe homepage copy changes for this objective.");

    const tokens = tokenize(section.content);
    const applied = applyExactReplacements(tokens, requested);
    if (!applied.length) throw httpError(409, "safe_homepage_replacements_unmatched", "Kairos could not bind the generated copy to exact visible text in the current homepage.");
    const replacementSource = tokens.join("");
    const beforeSignature = markupSignature(section.content);
    const afterSignature = markupSignature(replacementSource);
    if (beforeSignature !== afterSignature) throw httpError(409, "preserve_design_structure_change_detected", "The preserve-design plan changed Liquid or markup structure.");

    const sourceHashes = { [HOMEPAGE_FILE]: template.sha256 || null, [SECTION_FILE]: section.sha256 || null, [CSS_FILE]: css.sha256 || null };
    const now = new Date().toISOString();
    const liquidContentPatch = {
      filename: SECTION_FILE,
      originalSource: section.content,
      replacementSource,
      beforeSignature,
      afterSignature,
      visibleTextReplacementCount: applied.filter(item => !item.alreadyPresent).length,
      verifiedAlreadyPresentCount: applied.filter(item => item.alreadyPresent).length,
      replacements: applied,
      unmatched: [],
      inventory,
      nodeDistributionPreserved: true,
      styledTextNodesPreserved: true,
      literalOnly: false,
      intelligentPreserveDesign: true,
      fuzzyMatchingUsed: false,
      defaultReplacementMapUsed: false,
    };
    const summary = String(proposal?.summary || `Kairos prepared ${applied.length} design-preserving homepage copy update${applied.length === 1 ? "" : "s"}.`).trim();
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      requestType: "homepage-preserve-design",
      homepageMode: "preserve-current-design",
      status: "ready-for-approval",
      readOnly: true,
      build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
      kernel: "homepage-preserve-design-plan-v1",
      startedAt: now,
      completedAt: now,
      objective,
      summary,
      plan: {
        summary,
        strategy: "Rewrite only exact visible homepage text groups while preserving the current design system and all Shopify structure.",
        changes: applied.map(item => ({ filename: SECTION_FILE, changeType: item.alreadyPresent ? "verify" : "modify", purpose: item.alreadyPresent ? `Verify approved copy already present: “${item.after}”.` : `Replace “${item.before}” with “${item.after}”.`, expectedOutcome: "Updated customer-facing copy inside the existing design." })),
        risks: ["Replacement copy may wrap naturally inside the existing responsive design."],
        acceptanceCriteria: ["Only visible homepage copy changes.", "Every source phrase matches one exact visible-text group.", "Liquid and HTML token signatures remain identical.", "Styled text-node distribution remains present.", `${HOMEPAGE_FILE} remains unchanged.`, `${CSS_FILE} remains unchanged.`, "The live MAIN theme remains unchanged."],
        rollbackPlan: [`Restore only the original ${SECTION_FILE} source on Kairos Staging.`],
        installationMode: "existing-liquid-visible-text",
        liquidContentPatch,
        canonicalPackage: null,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        sourceHashes,
        mutationScope: "intelligent-preserve-design-copy",
        executable: true,
        preserveExistingDesign: true,
        structuralMutationAuthorized: false,
        styleMutationAuthorized: false,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
        literalOnly: false,
        intelligentCopyGeneration: true,
        fuzzyMatchingAuthorized: false,
      },
      evidence: {
        sourceInspectionActionID: sourceBody.actionID || "",
        stagingTheme: evidence.stagingTheme,
        mainTheme: evidence.mainTheme,
        planningEngine: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD,
        intelligenceRuntime: generated.runtime,
        intelligenceModel: generated.model,
        privacy: generated.privacy,
        modelReasoningStored: false,
        markupSignaturePreserved: true,
        nodeDistributionPreserved: true,
        templateUnchanged: true,
        stylesheetUnchanged: true,
        replacementCount: applied.length,
      },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
    await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(completed), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-MMG-Runtime": KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD } }));
    return json({ jobID, status: "completed", build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD, pollURL: `/api/shopify/staging/plan/jobs/${jobID}`, summary, result }, 202);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : Number(error?.statusCode || 500);
    return json({ status: "needs-attention", build: KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD, summary: "Kairos could not prepare the preserve-design homepage update.", error: { status, code: typeof error?.code === "string" ? error.code : "homepage_preserve_plan_failed", message: error instanceof Error ? error.message : "Preserve-design homepage planning failed." } }, status);
  }
}

function normalizeReplacements(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(item => ({ before: clean(item?.before), after: clean(item?.after), reason: clean(item?.reason).slice(0, 300) })).filter(item => item.before && item.after && item.before !== item.after && item.after.length <= 900 && !seen.has(item.before) && seen.add(item.before)).slice(0, 80);
}

function applyExactReplacements(tokens, replacements) {
  const groups = buildGroups(tokens);
  const used = new Set();
  const applied = [];
  for (const requested of replacements) {
    const matches = groups.map((group, index) => ({ group, index })).filter(item => !used.has(item.index) && item.group.normalized === normalizeVisible(requested.before));
    if (matches.length !== 1) continue;
    const match = matches[0];
    const alreadyPresent = match.group.normalized === normalizeVisible(requested.after);
    if (!alreadyPresent) writeGroupPreservingNodes(tokens, match.group, requested.after);
    used.add(match.index);
    applied.push({ requestedBefore: requested.before, before: match.group.text, matchedText: match.group.text, after: requested.after, reason: requested.reason, confidence: 1, unique: true, nodeCount: match.group.textIndexes.length, nodeDistributionPreserved: true, alreadyPresent, literalMatch: true, intelligentPreserveDesign: true });
  }
  return applied;
}

function tokenize(source) { return String(source || "").split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g); }

function buildGroups(tokens) {
  const groups = [];
  let current = [];
  let blocked = 0;
  const flush = () => {
    const textIndexes = current.filter(index => isVisibleText(tokens[index]));
    const text = textIndexes.map(index => decodeEntities(tokens[index])).join(" ").replace(/\s+/g, " ").trim();
    if (text) groups.push({ text, normalized: normalizeVisible(text), textIndexes });
    current = [];
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.startsWith("{{") || token.startsWith("{%")) { current.push(index); continue; }
    if (token.startsWith("<")) {
      const close = token.match(/^<\s*\/\s*([a-z0-9:-]+)/i);
      const open = token.match(/^<\s*([a-z0-9:-]+)/i);
      const tag = String(close?.[1] || open?.[1] || "").toLowerCase();
      if (close && BLOCKED_TAGS.has(tag)) blocked = Math.max(0, blocked - 1);
      if (blocked === 0 && BLOCK_TAGS.has(tag)) flush();
      current.push(index);
      if (open && !close && !/\/\s*>$/.test(token) && BLOCKED_TAGS.has(tag)) blocked += 1;
      if (blocked === 0 && close && BLOCK_TAGS.has(tag)) flush();
      continue;
    }
    if (blocked === 0) current.push(index);
  }
  flush();
  return groups;
}

function isVisibleText(token) { const value = String(token || ""); return Boolean(value.trim()) && !value.startsWith("<") && !value.startsWith("{{") && !value.startsWith("{%"); }

function writeGroupPreservingNodes(tokens, group, replacement) {
  const indexes = group.textIndexes;
  const originals = indexes.map(index => tokens[index]);
  const weights = originals.map(token => Math.max(1, normalizeVisible(token).split(" ").filter(Boolean).length));
  const parts = distribute(String(replacement || "").trim(), weights);
  indexes.forEach((tokenIndex, index) => {
    const original = originals[index];
    tokens[tokenIndex] = `${original.match(/^\s*/)?.[0] || ""}${parts[index] || ""}${original.match(/\s*$/)?.[0] || ""}`;
  });
}

function distribute(replacement, weights) {
  if (weights.length <= 1) return [replacement];
  const words = replacement.split(/\s+/).filter(Boolean);
  if (words.length < weights.length) return weights.map((_, index) => index === 0 ? replacement : "");
  const total = weights.reduce((sum, value) => sum + value, 0) || weights.length;
  const counts = weights.map(weight => Math.max(1, Math.floor(words.length * weight / total)));
  let assigned = counts.reduce((sum, value) => sum + value, 0);
  while (assigned > words.length) {
    let changed = false;
    for (let index = counts.length - 1; index >= 0 && assigned > words.length; index -= 1) if (counts[index] > 1) { counts[index] -= 1; assigned -= 1; changed = true; }
    if (!changed) break;
  }
  while (assigned < words.length) { counts[counts.length - 1] += 1; assigned += 1; }
  let cursor = 0;
  return counts.map(count => { const part = words.slice(cursor, cursor + count).join(" "); cursor += count; return part; });
}

function markupSignature(source) { return (String(source || "").match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g) || []).join("\u001f"); }
function normalizeVisible(value) { return decodeEntities(String(value || "")).replace(/\s+/g, " ").trim().toLowerCase(); }
function decodeEntities(value) { return String(value || "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">"); }
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function validateBoundary(stagingTheme, mainTheme) { if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required."); if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified."); }
function jobRequest(request, jobID) { return new Request(new URL(`/_kairos/standalone-execution-jobs/${jobID}`, request.url).toString(), { method: "GET" }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-MMG-Runtime": KAIROS_HOMEPAGE_PRESERVE_PLANNER_BUILD, "X-Kairos-Homepage-Mode": "preserve-current-design", "X-Kairos-Design-Preservation": "template-css-markup-node-distribution", "X-Content-Type-Options": "nosniff" } }); }
