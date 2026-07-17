import {
  hashText,
  httpError,
  inspectStagingSource,
  inspectThemeFiles,
  parseShopifyJson,
} from "./kairos-compact-homepage-utils-v1.js";

export const KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD = "kairos-homepage-deterministic-liquid-copy-planner-20260717-1";

const PLAN_ROUTE = "/api/shopify/staging/plan/jobs";
const TEMPLATE_FILE = "templates/index.json";
const BLOCK_TAGS = new Set(["address","article","aside","blockquote","button","div","figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header","li","main","nav","p","section","td","th"]);
const BLOCKED_TAGS = new Set(["script","style","svg","template","noscript","code","pre"]);
const HOMEPAGE_SECTION_HINT = /(home|homepage|landing|mmg|hero)/i;
const COPY_SEQUENCE = Object.freeze([
  { kind: "heading", text: "Turn what you know into something valuable" },
  { kind: "body", text: "Mindset Media Group helps creators, entrepreneurs, authors, educators, and small businesses transform ideas and experience into professional books, digital products, educational resources, and business assets." },
  { kind: "heading", text: "Your connected knowledge journey" },
  { kind: "body", text: "Explore practical guidance, creator education, publishing support, and professional resources designed to move you from idea to finished asset." },
  { kind: "heading", text: "Create, publish, and grow" },
  { kind: "body", text: "Build useful intellectual property, strengthen your platform, and turn your knowledge into work that serves people and creates lasting value." },
  { kind: "heading", text: "Choose your next step" },
  { kind: "body", text: "Start with the resource, product, or service that matches where you are now. Every step is designed to create clear, visible progress." },
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== PLAN_ROUTE) {
      return json({ status: "not-found", build: KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD }, 404);
    }
    return createPlan(request, env);
  },
};

async function createPlan(request, env) {
  try {
    const payload = await request.json();
    const objective = String(payload?.objective || "").trim();
    if (objective.length < 3) throw httpError(400, "objective_required", "Tell Kairos what you want changed on the homepage.");

    const initial = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD, [TEMPLATE_FILE]);
    const evidence = initial?.evidence || {};
    validateBoundary(evidence.stagingTheme, evidence.mainTheme);

    const mainTemplateInspection = await inspectThemeFiles(env, evidence.mainTheme.gid, [TEMPLATE_FILE]);
    const mainTemplate = fileByName(mainTemplateInspection.files, TEMPLATE_FILE);
    const stagingTemplate = fileByName(evidence.files, TEMPLATE_FILE);
    if (!mainTemplate?.content || !stagingTemplate?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read the published and staging homepage templates.");

    const publishedDocument = parseShopifyJson(mainTemplate.content, "Published MAIN homepage");
    const sectionFilenames = activeHomepageSectionFilenames(publishedDocument);
    if (!sectionFilenames.length) throw httpError(409, "homepage_liquid_section_missing", "The published homepage has no active Liquid section available for deterministic copy planning.");

    const mainSectionsInspection = await inspectThemeFiles(env, evidence.mainTheme.gid, sectionFilenames);
    const stagingInspection = await inspectStagingSource(null, request, env, KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD, [TEMPLATE_FILE, ...sectionFilenames]);
    const stagingFiles = new Map((stagingInspection?.evidence?.files || []).map(file => [file.filename, file]));
    const mainFiles = new Map((mainSectionsInspection.files || []).map(file => [file.filename, file]));
    const eligible = sectionFilenames.filter(filename => {
      const file = mainFiles.get(filename);
      return file?.content && isHomepageSpecificSection(filename, file.content);
    });
    if (!eligible.length) throw httpError(409, "homepage_liquid_scope_unsafe", "Kairos found no homepage-specific Liquid section and will not edit shared page source.");

    const candidates = [];
    for (const filename of eligible) {
      const file = mainFiles.get(filename);
      for (const group of buildGroups(tokenize(file.content), filename)) {
        if (!group.primary || !["heading", "body"].includes(group.kind)) continue;
        if (group.text.length < 4 || group.text.length > 1200) continue;
        candidates.push(group);
      }
    }
    const replacements = buildDeterministicReplacements(candidates);
    if (!replacements.length) throw httpError(409, "deterministic_liquid_visible_copy_missing", "The active homepage Liquid sections expose no safe visible heading or paragraph text nodes for deterministic replacement.");

    const byFile = new Map();
    for (const replacement of replacements) {
      if (!byFile.has(replacement.filename)) byFile.set(replacement.filename, []);
      byFile.get(replacement.filename).push(replacement);
    }

    const liquidTextPatches = [];
    for (const [filename, fileReplacements] of byFile) {
      const mainFile = mainFiles.get(filename);
      const stagingFile = stagingFiles.get(filename);
      if (!mainFile?.content || !stagingFile?.content) throw httpError(409, "homepage_liquid_source_unavailable", `Kairos could not read ${filename} from both published MAIN and staging.`);
      const tokens = tokenize(mainFile.content);
      const groups = new Map(buildGroups(tokens, filename).map(group => [group.id, group]));
      const applied = [];
      for (const replacement of fileReplacements) {
        const group = groups.get(replacement.id);
        if (!group || group.text !== replacement.before) continue;
        writeGroupPreservingNodes(tokens, group, replacement.after);
        applied.push({ ...replacement, nodeDistributionPreserved: true });
      }
      if (!applied.length) continue;
      const candidateSource = tokens.join("");
      const beforeSignature = markupSignature(mainFile.content);
      const afterSignature = markupSignature(candidateSource);
      if (beforeSignature !== afterSignature) throw httpError(409, "liquid_markup_signature_mismatch", `The deterministic copy change altered markup or Liquid in ${filename}.`);
      liquidTextPatches.push({
        filename,
        publishedSource: mainFile.content,
        stagingBeforeSource: stagingFile.content,
        candidateSource,
        publishedSha256: mainFile.sha256,
        stagingBeforeSha256: stagingFile.sha256,
        expectedCandidateSha256: await hashText(candidateSource),
        beforeSignature,
        afterSignature,
        replacements: applied,
        nodeDistributionPreserved: true,
      });
    }
    if (!liquidTextPatches.length) throw httpError(409, "deterministic_liquid_patch_empty", "Kairos could not bind deterministic copy to the published homepage Liquid source.");

    const sourceHashes = {
      [`published:${TEMPLATE_FILE}`]: mainTemplate.sha256,
      [`staging:${TEMPLATE_FILE}`]: stagingTemplate.sha256,
    };
    for (const patch of liquidTextPatches) {
      sourceHashes[`published:${patch.filename}`] = patch.publishedSha256;
      sourceHashes[`staging:${patch.filename}`] = patch.stagingBeforeSha256;
    }

    const count = liquidTextPatches.reduce((sum, patch) => sum + patch.replacements.length, 0);
    const now = new Date().toISOString();
    const summary = `Kairos prepared ${count} deterministic visible homepage Liquid copy replacement${count === 1 ? "" : "s"}.`;
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      requestType: "homepage-preserve-design",
      homepageMode: "preserve-published-framework",
      status: "ready-for-approval",
      readOnly: true,
      build: KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD,
      kernel: "published-homepage-deterministic-liquid-copy-plan-v1",
      startedAt: now,
      completedAt: now,
      objective,
      summary,
      plan: {
        summary,
        strategy: "Rewrite verified literal heading and paragraph text nodes in homepage-specific Liquid while preserving every markup, Liquid, CSS, asset, class, link, and layout token.",
        changes: liquidTextPatches.flatMap(patch => patch.replacements.map(item => ({
          filename: patch.filename,
          changeType: "replace-visible-text",
          purpose: `Replace “${item.before}” with “${item.after}”.`,
          expectedOutcome: item.reason,
        }))),
        risks: ["Longer copy may wrap differently inside the unchanged responsive design."],
        acceptanceCriteria: [
          "Only verified literal visible text nodes change.",
          "Liquid and HTML token signatures remain identical.",
          "Section structure, CSS, assets, classes, links, layout, animation, and responsive behavior remain unchanged.",
          "Only the verified non-live Kairos Staging theme may be written before final approval.",
        ],
        rollbackPlan: ["Restore the exact pre-execution staging template and Liquid section sources."],
        installationMode: "published-main-liquid-visible-text-v1",
        templatePatch: {
          filename: TEMPLATE_FILE,
          publishedSource: mainTemplate.content,
          stagingBeforeSource: stagingTemplate.content,
          publishedSha256: mainTemplate.sha256,
          stagingBeforeSha256: stagingTemplate.sha256,
          expectedCandidateSha256: mainTemplate.sha256,
        },
        liquidTextPatches,
        canonicalPackage: null,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        sourceTheme: evidence.mainTheme,
        sourceHashes,
        mutationScope: "published-main-homepage-deterministic-liquid-literal-text-only",
        executable: true,
        preserveExistingDesign: true,
        preservePublishedFramework: true,
        liquidTextOnly: true,
        deterministicFallback: true,
        structuralMutationAuthorized: false,
        styleMutationAuthorized: false,
        assetMutationAuthorized: false,
        liquidStructureMutationAuthorized: false,
        productionPublishAuthorized: false,
        liveThemeMutationAuthorized: false,
      },
      evidence: {
        sourceOfTruth: "published-main-theme",
        planningEngine: KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD,
        intelligenceRuntime: "deterministic-native",
        intelligenceModel: null,
        privacy: "local-deterministic-processing",
        modelReasoningStored: false,
        deterministicFallback: true,
        publishedFrameworkPreserved: true,
        literalLiquidTextOnly: true,
        replacementCount: count,
        visibleTextReplacementCount: count,
        liquidFiles: liquidTextPatches.map(patch => patch.filename),
        stylesheetsChanged: 0,
        assetsChanged: 0,
      },
    };

    const jobID = crypto.randomUUID();
    const completed = { jobID, status: "completed", build: KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
    await caches.default.put(jobRequest(request, jobID), new Response(JSON.stringify(completed), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-MMG-Runtime": KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD },
    }));
    return json({ ...completed, pollURL: `/api/shopify/staging/plan/jobs/${jobID}` }, 202);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : Number(error?.statusCode || 500);
    return json({
      status: status >= 500 ? "failed" : "needs-attention",
      build: KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD,
      error: { code: error?.code || "deterministic_liquid_copy_plan_failed", message: error instanceof Error ? error.message : "Deterministic Liquid copy planning failed." },
    }, status);
  }
}

function activeHomepageSectionFilenames(document) {
  const order = Array.isArray(document?.order) ? document.order : [];
  const types = [];
  for (const sectionId of order) {
    const section = document?.sections?.[sectionId];
    if (!section || section.disabled === true) continue;
    const type = String(section.type || "").trim();
    if (!/^[a-z0-9_-]+$/i.test(type)) continue;
    if (!types.includes(type)) types.push(type);
  }
  return types.map(type => `sections/${type}.liquid`).slice(0, 40);
}

function isHomepageSpecificSection(filename, source) {
  if (HOMEPAGE_SECTION_HINT.test(filename)) return true;
  const schema = String(source || "").match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/i)?.[1] || "";
  return HOMEPAGE_SECTION_HINT.test(schema);
}

function tokenize(source) {
  return String(source || "").split(/({{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>)/g);
}

function buildGroups(tokens, filename) {
  const groups = [];
  let current = [];
  let blockedTagDepth = 0;
  let schemaDepth = 0;
  let ordinal = 0;
  const flush = () => {
    const textIndexes = current.filter(index => isVisibleText(tokens[index]));
    const text = textIndexes.map(index => decodeEntities(tokens[index])).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      const markup = current.map(index => tokens[index]).filter(token => String(token).startsWith("<")).join(" ");
      const kind = /<\s*h[1-3]\b/i.test(markup) ? "heading" : /<\s*p\b/i.test(markup) ? "body" : "other";
      groups.push({
        id: `${filename}#${ordinal++}`,
        filename,
        text,
        textIndexes,
        kind,
        primary: kind !== "other",
      });
    }
    current = [];
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.startsWith("{%")) {
      if (/{%\s*schema\s*%}/i.test(token)) { flush(); schemaDepth += 1; continue; }
      if (/{%\s*endschema\s*%}/i.test(token)) { schemaDepth = Math.max(0, schemaDepth - 1); continue; }
      if (schemaDepth === 0 && blockedTagDepth === 0) current.push(index);
      continue;
    }
    if (schemaDepth > 0) continue;
    if (token.startsWith("{{")) {
      if (blockedTagDepth === 0) current.push(index);
      continue;
    }
    if (token.startsWith("<")) {
      const close = token.match(/^<\s*\/\s*([a-z0-9:-]+)/i);
      const open = token.match(/^<\s*([a-z0-9:-]+)/i);
      const tag = String(close?.[1] || open?.[1] || "").toLowerCase();
      if (close && BLOCKED_TAGS.has(tag)) blockedTagDepth = Math.max(0, blockedTagDepth - 1);
      if (blockedTagDepth === 0 && BLOCK_TAGS.has(tag)) flush();
      if (blockedTagDepth === 0) current.push(index);
      if (open && !close && !/\/\s*>$/.test(token) && BLOCKED_TAGS.has(tag)) blockedTagDepth += 1;
      if (blockedTagDepth === 0 && close && BLOCK_TAGS.has(tag)) flush();
      continue;
    }
    if (blockedTagDepth === 0) current.push(index);
  }
  flush();
  return groups;
}

function buildDeterministicReplacements(candidates) {
  const used = new Set();
  const replacements = [];
  for (const replacement of COPY_SEQUENCE) {
    const candidate = candidates.find(item => item.kind === replacement.kind && !used.has(item.id) && item.text.trim() !== replacement.text);
    if (!candidate) continue;
    used.add(candidate.id);
    replacements.push({
      id: candidate.id,
      filename: candidate.filename,
      before: candidate.text,
      after: replacement.text,
      kind: candidate.kind,
      primary: true,
      reason: replacement.kind === "heading" ? "Clarify the customer-facing journey and value proposition." : "Explain MMG services and customer outcomes in direct language.",
    });
  }
  return replacements.slice(0, 8);
}

function isVisibleText(token) {
  const value = String(token || "");
  return Boolean(value.trim()) && !value.startsWith("<") && !value.startsWith("{{") && !value.startsWith("{% ");
}

function writeGroupPreservingNodes(tokens, group, replacement) {
  const originals = group.textIndexes.map(index => tokens[index]);
  const weights = originals.map(token => Math.max(1, decodeEntities(token).trim().split(/\s+/).filter(Boolean).length));
  const parts = distributeWords(replacement, weights);
  group.textIndexes.forEach((tokenIndex, index) => {
    const original = originals[index];
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    tokens[tokenIndex] = `${leading}${parts[index] || ""}${trailing}`;
  });
}

function distributeWords(replacement, weights) {
  if (weights.length <= 1) return [replacement];
  const words = String(replacement || "").split(/\s+/).filter(Boolean);
  if (words.length < weights.length) return weights.map((_, index) => index === 0 ? replacement : "");
  const total = weights.reduce((sum, value) => sum + value, 0) || weights.length;
  const counts = weights.map(weight => Math.max(1, Math.floor(words.length * weight / total)));
  let assigned = counts.reduce((sum, value) => sum + value, 0);
  while (assigned > words.length) {
    let changed = false;
    for (let index = counts.length - 1; index >= 0 && assigned > words.length; index -= 1) {
      if (counts[index] > 1) { counts[index] -= 1; assigned -= 1; changed = true; }
    }
    if (!changed) break;
  }
  while (assigned < words.length) { counts[counts.length - 1] += 1; assigned += 1; }
  let cursor = 0;
  return counts.map(count => {
    const part = words.slice(cursor, cursor + count).join(" ");
    cursor += count;
    return part;
  });
}

function markupSignature(source) {
  return (String(source || "").match(/{{[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g) || []).join("\u001f");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function validateBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
}

function fileByName(files, filename) {
  return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null;
}

function jobRequest(request, jobID) {
  return new Request(new URL(`/_kairos/standalone-execution-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_HOMEPAGE_DETERMINISTIC_LIQUID_COPY_PLANNER_BUILD,
      "X-Kairos-Homepage-Deterministic-Liquid": "node-preserving-literal-text",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
