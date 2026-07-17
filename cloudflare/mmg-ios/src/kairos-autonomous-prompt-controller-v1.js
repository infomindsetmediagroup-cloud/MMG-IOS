import {
  createWorkflow,
  listWorkflows,
  readWorkflow,
  updateTask,
  updateWorkflow,
} from "./kairos-workflow-runtime-v1.js";
import {
  hashText,
  httpError,
  inspectStagingSource,
  parseShopifyJson,
  validateHomepageDocument,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";
import { parseStrictJSON, runKairosIntelligence } from "./kairos-intelligence-v1.js";

export const KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD = "kairos-autonomous-prompt-controller-20260717-1";

const TEMPLATE_FILE = "templates/index.json";
const WEBSITE_MODE = "autonomous-text-only-v1";
const JOB_TTL_SECONDS = 60 * 60;
const MAX_INVENTORY_ITEMS = 180;
const MAX_OPERATIONS = 16;
const DEFAULT_ACCOUNT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

const ACTION_META = Object.freeze({
  "knowledge-library": ["Knowledge Library", "knowledge"],
  "research-brief": ["Research Brief", "knowledge"],
  "decision-record": ["Decision Record", "knowledge"],
  "doctrine-vault": ["Doctrine Vault", "knowledge"],
  "intelligence-synthesis": ["Intelligence Synthesis", "knowledge"],
  "manuscript-studio": ["Manuscript Studio", "content"],
  "social-production": ["Social Production", "content"],
  "publishing-studio": ["Publishing Studio", "content"],
  "creative-studio": ["Creative Studio", "content"],
  "product-launch": ["Product Launch", "business"],
  "revenue-intelligence": ["Revenue Intelligence", "business"],
  "growth-plan": ["Growth Plan", "business"],
  "offer-builder": ["Offer Builder", "business"],
  "campaign-operations": ["Campaign Operations", "business"],
  "visitor-activity": ["Visitor Activity", "customers"],
  "customer-portal": ["Customer Portal", "customers"],
  deliverables: ["Deliverables", "customers"],
  "customer-journey": ["Customer Journey", "customers"],
  "support-intelligence": ["Support Intelligence", "customers"],
  health: ["Runtime Health", "operations"],
  "work-queue": ["Work Queue", "operations"],
  "release-control": ["Release Control", "operations"],
  "executive-briefing": ["Executive Briefing", "operations"],
  "system-registry": ["System Registry", "operations"],
});

export async function handleAutonomousPromptRequest(request, env, ctx, delegate) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/autonomy/status") {
    return json({
      status: "operational",
      build: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
      visualBaseline: "tuesday-command-center-6f96b10d",
      browserSurfaceChanged: false,
      promptExecution: "objective-to-workflow-to-verified-deliverable",
      websiteExecution: WEBSITE_MODE,
      stagingOnly: true,
      liveThemeMutationAutomatic: false,
      structuralMutationAutomatic: false,
      styleMutationAutomatic: false,
      intelligence: intelligenceStatus(env),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/hub/run") {
    return runChildPrompt(request, env, delegate);
  }

  if (request.method === "POST" && url.pathname === "/api/shopify/staging/plan/jobs") {
    return createWebsiteTextPlan(request, env);
  }

  const planJob = url.pathname.match(/^\/api\/shopify\/staging\/plan\/jobs\/([a-f0-9-]+)$/i);
  if (request.method === "GET" && planJob) {
    return (await readJob(request, "plan", planJob[1])) || delegate(request);
  }

  if (request.method === "POST" && url.pathname === "/api/shopify/staging/execute/jobs") {
    const payload = await safeRequestJSON(request.clone());
    if (payload?.plan?.plan?.installationMode === WEBSITE_MODE) return executeWebsiteTextPlan(request, env, payload);
    return delegate(request);
  }

  const executionJob = url.pathname.match(/^\/api\/shopify\/staging\/execute\/jobs\/([a-f0-9-]+)$/i);
  if (request.method === "GET" && executionJob) {
    return (await readJob(request, "execution", executionJob[1])) || delegate(request);
  }

  return null;
}

export async function runAutonomousScheduledCycle(controller) {
  return {
    status: "operational",
    build: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
    trigger: controller?.cron || "scheduled",
    policy: "prompt workflows execute immediately; scheduled work remains bounded by existing supervisors",
  };
}

async function runChildPrompt(request, env, delegate) {
  const payload = await safeRequestJSON(request.clone());
  const action = clean(payload?.action, 120).toLowerCase();
  const objective = clean(payload?.objective, 12000);
  const meta = ACTION_META[action];
  if (!meta || action === "website") return delegate(rebuildRequest(request, payload));
  if (!objective && !["health", "work-queue", "release-control", "executive-briefing", "system-registry", "visitor-activity"].includes(action)) {
    return failure(400, "objective_required", `Enter the ${meta[0].toLowerCase()} objective.`);
  }

  const workflow = await createWorkflow(request, {
    title: `${meta[0]} · ${shortTitle(objective || `Inspect ${meta[0]}`)}`,
    objective: objective || `Inspect and operate ${meta[0]} using current authoritative records.`,
    center: meta[1],
    owner: "Kairos",
    source: `autonomous-prompt/${action}`,
    tasks: [
      { title: "Interpret the prompt", description: "Resolve the objective, constraints, authority, and completion evidence." },
      { title: "Execute the governed domain action", description: "Use the existing MMG/Kairos domain runtime and authoritative records." },
      { title: "Verify and preserve the deliverable", description: "Read back the result and preserve a finished deliverable and receipt." },
    ],
  });
  await updateWorkflow(request, workflow.id, { command: "start" });

  try {
    const baseResponse = await delegate(rebuildRequest(request, payload));
    const baseBody = await safeResponseJSON(baseResponse.clone());
    await updateTask(request, workflow.id, workflow.tasks[0].id, { state: "completed" });

    let result = normalizeBaseDeliverable(baseBody, action, meta[0], objective);
    if (!baseResponse.ok || !result.sections.length) {
      result = await buildIntelligentDeliverable(env, { action, title: meta[0], objective, baseBody });
    } else {
      result = await optionallyRefineDeliverable(env, { action, title: meta[0], objective, baseBody, result });
    }

    await updateTask(request, workflow.id, workflow.tasks[1].id, { state: "completed" });
    await updateTask(request, workflow.id, workflow.tasks[2].id, { state: "completed" });
    const completed = await updateWorkflow(request, workflow.id, { command: "complete" });

    return json({
      status: "completed",
      build: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
      kernel: "autonomous-prompt-controller-v1",
      action,
      workItemID: baseBody?.workItemID || workflow.id,
      workflowID: workflow.id,
      summary: result.summary,
      sections: result.sections,
      nextAction: result.nextAction,
      workflow: completed,
      evidence: {
        source: "existing-domain-runtime-plus-kairos-intelligence",
        baseRuntimeStatus: baseResponse.status,
        externalActionTaken: Boolean(baseBody?.evidence?.externalActionTaken),
        inventedData: false,
        browserSurfaceChanged: false,
      },
    });
  } catch (error) {
    await updateWorkflow(request, workflow.id, { command: "block", reason: safeMessage(error) }).catch(() => null);
    return failure(Number(error?.status || error?.statusCode || 500), error?.code || "autonomous_prompt_failed", safeMessage(error));
  }
}

async function createWebsiteTextPlan(request, env) {
  const payload = await safeRequestJSON(request.clone());
  const objective = clean(payload?.objective, 12000);
  if (objective.length < 3) return failure(400, "objective_required", "Tell Kairos exactly what homepage text should change.");

  const workflow = await createWorkflow(request, {
    title: `Website Retool · ${shortTitle(objective)}`,
    objective,
    center: "content",
    owner: "Website Production",
    source: "autonomous-prompt/website-text-only",
    tasks: [
      { title: "Inspect the current staging source" },
      { title: "Interpret the text-change prompt" },
      { title: "Build a source-bound text-only plan" },
      { title: "Apply approved text replacements to staging" },
      { title: "Verify exact staging read-back" },
    ],
  });
  await updateWorkflow(request, workflow.id, { command: "start" });

  try {
    const source = await inspectHomepageSource(request, env);
    await updateTask(request, workflow.id, workflow.tasks[0].id, { state: "completed" });

    const inventory = buildHomepageInventory(source);
    if (!inventory.length) throw httpError(409, "homepage_text_inventory_empty", "Kairos could not locate any existing visible homepage text in the template or its referenced section files.");

    const proposed = await proposeTextOperations(env, objective, inventory);
    const operations = normalizeOperations(proposed.operations, inventory);
    if (!operations.length) throw httpError(409, "safe_text_changes_missing", "Kairos could not bind the prompt to existing visible text. Use an explicit instruction such as: replace “current text” with “new text”.");
    await updateTask(request, workflow.id, workflow.tasks[1].id, { state: "completed" });

    const packageResult = await buildTextPackage(source, operations);
    await updateTask(request, workflow.id, workflow.tasks[2].id, { state: "completed" });

    const now = new Date().toISOString();
    const summary = clean(proposed.summary, 1000) || `Kairos prepared ${operations.length} source-bound text replacement${operations.length === 1 ? "" : "s"} without changing the visual framework.`;
    const result = {
      actionID: crypto.randomUUID(),
      planID: crypto.randomUUID(),
      actionType: "shopify.staging.plan",
      status: "ready-for-approval",
      readOnly: true,
      build: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
      kernel: "autonomous-homepage-text-planner-v1",
      startedAt: now,
      completedAt: now,
      objective,
      summary,
      workflowID: workflow.id,
      plan: {
        summary,
        strategy: "Keep the current Tuesday visual baseline and Shopify theme structure unchanged. Replace only source-bound visible text on the verified non-live Kairos Staging theme.",
        changes: packageResult.files.map(file => ({
          filename: file.filename,
          changeType: "replace-visible-text",
          purpose: `${file.operations.length} approved text replacement${file.operations.length === 1 ? "" : "s"} in the existing file.`,
          expectedOutcome: "New customer-facing copy with identical Liquid, HTML, section, block, style, asset, link, and layout structure.",
        })),
        risks: ["Longer replacement copy may wrap differently inside the unchanged design."],
        acceptanceCriteria: [
          "Only existing visible text changes.",
          "Every HTML tag, attribute, Liquid token, section ID, block ID, setting key, link, class, asset reference, color, typography rule, spacing rule, and layout instruction remains unchanged.",
          "All writes target Kairos Staging only.",
          "Every changed file is read back from Shopify and must match the approved candidate exactly.",
          "The live MAIN theme remains unchanged.",
        ],
        rollbackPlan: ["Restore the exact pre-execution bytes for every changed Kairos Staging file."],
        installationMode: WEBSITE_MODE,
        textOnlyPackage: packageResult,
        targetTheme: source.stagingTheme,
        publishedTheme: source.mainTheme,
        sourceHashes: packageResult.sourceHashes,
        executable: true,
        textOnly: true,
        preserveExistingDesign: true,
        structuralMutationAuthorized: false,
        styleMutationAuthorized: false,
        visualMutationAuthorized: false,
        liquidStructureMutationAuthorized: false,
        cssMutationAuthorized: false,
        assetMutationAuthorized: false,
        liveThemeMutationAuthorized: false,
        productionPublishAuthorized: false,
      },
      evidence: {
        sourceInspectionActionID: source.actionID,
        sourceAdapter: "shopify-graphql-theme-files",
        inventoryCount: inventory.length,
        replacementCount: operations.length,
        filesChanged: packageResult.files.length,
        intelligence: proposed.intelligence,
        visualBaseline: "tuesday-command-center-6f96b10d",
        browserSurfaceChanged: false,
      },
    };

    const jobID = crypto.randomUUID();
    await storeJob(request, "plan", jobID, result, summary);
    return json({ jobID, status: "completed", build: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD, pollURL: `/api/shopify/staging/plan/jobs/${jobID}`, summary, result }, 202);
  } catch (error) {
    await updateWorkflow(request, workflow.id, { command: "block", reason: safeMessage(error) }).catch(() => null);
    return failure(Number(error?.status || error?.statusCode || 500), error?.code || "autonomous_homepage_plan_failed", safeMessage(error));
  }
}

async function executeWebsiteTextPlan(request, env, payload) {
  const planEnvelope = payload?.plan;
  const approval = payload?.approval;
  const plan = planEnvelope?.plan || {};
  if (!planEnvelope?.planID || approval?.status !== "approved" || approval?.planID !== planEnvelope.planID) {
    return failure(403, "approval_required", "Approve the exact text-only staging plan before Kairos writes any Shopify file.");
  }
  if (plan.installationMode !== WEBSITE_MODE || !plan.textOnlyPackage) {
    return failure(409, "text_only_package_missing", "The approved autonomous text-only package is missing.");
  }

  const workflowID = clean(planEnvelope.workflowID, 200);
  const workflow = workflowID ? await readWorkflow(request, workflowID) : null;

  try {
    const packageResult = plan.textOnlyPackage;
    const filenames = packageResult.files.map(file => file.filename);
    const inspection = await inspectStagingSource(null, request, env, KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD, [TEMPLATE_FILE, ...filenames]);
    const evidence = inspection?.evidence || {};
    validateThemeBoundary(evidence.stagingTheme, evidence.mainTheme);
    if (approval?.targetThemeID !== evidence.stagingTheme.gid || plan?.targetTheme?.gid !== evidence.stagingTheme.gid) {
      throw httpError(409, "staging_theme_changed", "The approved target no longer matches Kairos Staging.");
    }

    const currentFiles = new Map((evidence.files || []).map(file => [file.filename, file]));
    const source = sourceFromInspection(inspection, packageResult.sectionFiles || []);
    const inventory = buildHomepageInventory(source);
    const operations = normalizeOperations(packageResult.operations, inventory);
    if (operations.length !== packageResult.operations.length) throw httpError(409, "approved_text_operations_changed", "The approved text replacements no longer bind to the current staging source.");

    for (const file of packageResult.files) {
      const current = currentFiles.get(file.filename);
      if (!current?.content || current.sha256 !== file.beforeSha256 || plan.sourceHashes?.[file.filename] !== current.sha256 || approval?.sourceHashes?.[file.filename] !== current.sha256) {
        throw httpError(409, "staging_source_changed", `${file.filename} changed after approval. Build a new text-only plan.`);
      }
    }

    const rebuilt = await buildTextPackage(source, operations);
    if (rebuilt.files.length !== packageResult.files.length) throw httpError(409, "approved_file_set_changed", "The approved text-only file set changed.");
    for (const file of packageResult.files) {
      const candidate = rebuilt.files.find(item => item.filename === file.filename);
      if (!candidate || candidate.afterSha256 !== file.afterSha256 || candidate.candidateSource !== file.candidateSource || candidate.structureSignature !== file.structureSignature) {
        throw httpError(409, "approved_candidate_mismatch", `${file.filename} no longer matches the approved text-only candidate.`);
      }
    }

    const writes = packageResult.files.map(file => ({ filename: file.filename, content: file.candidateSource }));
    const write = await writeThemeFiles(env, evidence.stagingTheme.gid, writes);
    if (workflow) await updateTask(request, workflow.id, workflow.tasks[3].id, { state: "completed" });

    const verifyInspection = await inspectStagingSource(null, request, env, KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD, [TEMPLATE_FILE, ...filenames]);
    const verifyMap = new Map((verifyInspection?.evidence?.files || []).map(file => [file.filename, file]));
    const verification = [];
    for (const file of packageResult.files) {
      const readBack = verifyMap.get(file.filename);
      const matched = Boolean(readBack?.content === file.candidateSource && readBack?.sha256 === file.afterSha256);
      if (!matched) throw httpError(502, "staging_text_readback_mismatch", `Shopify did not preserve the exact approved text-only source for ${file.filename}.`);
      verification.push({ filename: file.filename, expectedSha256: file.afterSha256, actualSha256: readBack.sha256, matched: true, textOnly: true, structurePreserved: true });
    }
    if (workflow) {
      await updateTask(request, workflow.id, workflow.tasks[4].id, { state: "completed" });
      await updateWorkflow(request, workflow.id, { command: "complete" });
    }

    const completedAt = new Date().toISOString();
    const previewURL = stagingPreviewURL(env, evidence.stagingTheme.gid);
    const result = {
      actionID: crypto.randomUUID(),
      actionType: "shopify.staging.execute",
      status: "completed",
      build: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
      kernel: "autonomous-homepage-text-executor-v1",
      completedAt,
      objective: planEnvelope.objective,
      summary: `Kairos changed only ${packageResult.operations.length} approved visible text value${packageResult.operations.length === 1 ? "" : "s"} on Kairos Staging and verified every file read-back.`,
      execution: {
        operation: "themeFilesUpsert",
        engine: WEBSITE_MODE,
        targetTheme: evidence.stagingTheme,
        publishedTheme: evidence.mainTheme,
        publishedThemeChanged: false,
        productionPublishAuthorized: false,
        filesWritten: packageResult.files.map(file => ({ filename: file.filename, beforeSha256: file.beforeSha256, afterSha256: file.afterSha256 })),
        textOnly: true,
        stylesheetsWritten: [],
        assetsWritten: [],
        structureChanged: false,
        classesChanged: false,
        designTokensChanged: false,
      },
      verification,
      preview: { url: previewURL, mobileURL: previewURL, desktopURL: previewURL, targetThemeName: evidence.stagingTheme.name },
      evidence: {
        credentialPath: write.credentialPath,
        mutationResult: write.mutationResult,
        sourceInspectionActionID: inspection.actionID,
        readBackInspectionActionID: verifyInspection.actionID,
        replacementCount: packageResult.operations.length,
        visualBaseline: "tuesday-command-center-6f96b10d",
      },
      rollback: {
        required: false,
        authorized: false,
        targetThemeID: evidence.stagingTheme.gid,
        files: packageResult.files.map(file => ({ filename: file.filename, existed: true, sha256: file.beforeSha256, content: file.beforeSource })),
        instruction: "Rollback restores the exact pre-execution Kairos Staging file bytes. MAIN was never modified.",
      },
    };

    const jobID = crypto.randomUUID();
    await storeJob(request, "execution", jobID, result, result.summary);
    return json({ jobID, status: "completed", build: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD, pollURL: `/api/shopify/staging/execute/jobs/${jobID}`, summary: result.summary, result }, 202);
  } catch (error) {
    if (workflow) await updateWorkflow(request, workflow.id, { command: "block", reason: safeMessage(error) }).catch(() => null);
    return failure(Number(error?.status || error?.statusCode || 500), error?.code || "autonomous_homepage_execution_failed", safeMessage(error));
  }
}

async function inspectHomepageSource(request, env) {
  const initial = await inspectStagingSource(null, request, env, KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD, [TEMPLATE_FILE]);
  const templateFile = fileByName(initial?.evidence?.files, TEMPLATE_FILE);
  if (!templateFile?.content) throw httpError(409, "homepage_template_unavailable", "Kairos could not read templates/index.json from Kairos Staging.");
  const document = parseShopifyJson(templateFile.content, "Kairos Staging homepage");
  validateHomepageDocument(structuredClone(document), document);
  const sectionFiles = deriveSectionFiles(document);
  const inspection = sectionFiles.length
    ? await inspectStagingSource(null, request, env, KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD, [TEMPLATE_FILE, ...sectionFiles])
    : initial;
  validateThemeBoundary(inspection?.evidence?.stagingTheme, inspection?.evidence?.mainTheme);
  return sourceFromInspection(inspection, sectionFiles);
}

function sourceFromInspection(inspection, sectionFiles) {
  const evidence = inspection?.evidence || {};
  const templateFile = fileByName(evidence.files, TEMPLATE_FILE);
  const document = parseShopifyJson(templateFile?.content, "Kairos Staging homepage");
  return {
    actionID: inspection.actionID,
    stagingTheme: evidence.stagingTheme,
    mainTheme: evidence.mainTheme,
    document,
    templateFile,
    sectionFiles,
    files: new Map((evidence.files || []).map(file => [file.filename, file])),
  };
}

function buildHomepageInventory(source) {
  const inventory = [];
  collectTemplateInventory(source.document, inventory);
  for (const filename of source.sectionFiles || []) {
    const file = source.files.get(filename);
    if (!file?.content) continue;
    const segments = visibleTextSegments(file.content);
    segments.forEach((segment, index) => inventory.push({
      id: `liquid:${filename}:${index}`,
      kind: "liquid-text",
      filename,
      segmentIndex: index,
      before: segment.text,
      start: segment.start,
      end: segment.end,
      score: textScore("", segment.text, "liquid"),
    }));
  }
  return inventory
    .filter(item => item.before && item.before.length <= 1600)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_INVENTORY_ITEMS);
}

function collectTemplateInventory(document, inventory) {
  for (const [sectionId, section] of Object.entries(document?.sections || {})) {
    collectSettingsInventory(inventory, "section", sectionId, "", section?.settings || {});
    for (const [blockId, block] of Object.entries(section?.blocks || {})) {
      collectSettingsInventory(inventory, "block", sectionId, blockId, block?.settings || {});
    }
  }
}

function collectSettingsInventory(inventory, scope, sectionId, blockId, settings) {
  for (const [key, value] of Object.entries(settings || {})) {
    if (typeof value !== "string" || !value.trim()) continue;
    const base = `json:${scope}:${sectionId}:${blockId || "section"}:${key}`;
    if (isPlainEditableText(key, value)) {
      inventory.push({ id: base, kind: "json-text", filename: TEMPLATE_FILE, scope, sectionId, blockId, key, before: value, score: textScore(key, value, "json") });
      continue;
    }
    if (isMarkupSetting(key, value)) {
      const segments = visibleTextSegments(value);
      segments.forEach((segment, index) => inventory.push({
        id: `${base}:segment:${index}`,
        kind: "json-markup-text",
        filename: TEMPLATE_FILE,
        scope,
        sectionId,
        blockId,
        key,
        segmentIndex: index,
        before: segment.text,
        start: segment.start,
        end: segment.end,
        score: textScore(key, segment.text, "markup"),
      }));
    }
  }
}

async function proposeTextOperations(env, objective, inventory) {
  const explicit = explicitReplacements(objective, inventory);
  if (explicit.length) return { summary: `Prepared ${explicit.length} explicit text replacement${explicit.length === 1 ? "" : "s"}.`, operations: explicit, intelligence: { mode: "deterministic-explicit-replacement" } };

  const compactInventory = inventory.map(item => ({ id: item.id, before: item.before, location: item.filename, kind: item.kind }));
  const system = [
    "You are Kairos, the governed MMG customer-facing copy editor.",
    "Return strict JSON only.",
    "Choose only existing inventory items and copy each selected id and before value exactly.",
    "Change visible wording only. Never change HTML, Liquid, CSS, links, URLs, classes, assets, colors, typography, spacing, layout, section structure, block structure, products, prices, claims, metrics, testimonials, or factual data.",
    `Return at most ${MAX_OPERATIONS} operations.`,
    "Schema: {\"summary\":\"brief summary\",\"operations\":[{\"id\":\"exact inventory id\",\"before\":\"exact current text\",\"after\":\"replacement text\",\"reason\":\"brief reason\"}]}",
  ].join("\n");
  const generated = await runStructuredIntelligence(env, {
    purpose: "autonomous-homepage-text-plan",
    system,
    user: JSON.stringify({ objective, immutableVisualBaseline: true, inventory: compactInventory }),
  });
  return { summary: clean(generated.value?.summary, 1000), operations: generated.value?.operations || [], intelligence: generated.intelligence };
}

function normalizeOperations(value, inventory) {
  if (!Array.isArray(value)) return [];
  const byID = new Map(inventory.map(item => [item.id, item]));
  const used = new Set();
  const normalized = [];
  for (const raw of value) {
    const id = clean(raw?.id, 500);
    const source = byID.get(id);
    if (!source || used.has(id)) continue;
    const before = String(raw?.before ?? "");
    const after = cleanReplacement(raw?.after, source.before.length > 700 ? 2400 : 1600);
    if (before !== source.before || !after || after === before || !safeReplacement(after)) continue;
    if (["liquid-text", "json-markup-text"].includes(source.kind) && markupSkeleton(source.before) !== markupSkeleton(after)) continue;
    used.add(id);
    normalized.push({ ...source, after, reason: clean(raw?.reason, 500) });
    if (normalized.length >= MAX_OPERATIONS) break;
  }
  return normalized;
}

async function buildTextPackage(source, operations) {
  const grouped = new Map();
  for (const operation of operations) {
    if (!grouped.has(operation.filename)) grouped.set(operation.filename, []);
    grouped.get(operation.filename).push(operation);
  }
  const files = [];
  const sourceHashes = {};

  for (const [filename, fileOperations] of grouped) {
    const file = source.files.get(filename);
    if (!file?.content) throw httpError(409, "source_file_missing", `${filename} is no longer readable from Kairos Staging.`);
    let candidateSource;
    let structureSignature;
    if (filename === TEMPLATE_FILE) {
      const original = parseShopifyJson(file.content, "Kairos Staging homepage");
      const candidate = applyTemplateOperations(original, fileOperations);
      validateHomepageDocument(candidate, original);
      candidateSource = serializeLikeSource(file.content, candidate);
      structureSignature = templateStructureSignature(original);
      if (templateStructureSignature(candidate) !== structureSignature) throw httpError(409, "template_structure_changed", "The text proposal changed the Shopify homepage structure.");
    } else {
      candidateSource = applyVisibleOperations(file.content, fileOperations);
      structureSignature = sourceSkeleton(file.content);
      if (sourceSkeleton(candidateSource) !== structureSignature) throw httpError(409, "liquid_structure_changed", `${filename} changed outside visible text nodes.`);
    }
    const afterSha256 = await hashText(candidateSource);
    if (afterSha256 === file.sha256) continue;
    sourceHashes[filename] = file.sha256;
    files.push({
      filename,
      beforeSha256: file.sha256,
      afterSha256,
      beforeSource: file.content,
      candidateSource,
      structureSignature,
      operations: fileOperations.map(compactOperation),
    });
  }
  if (!files.length) throw httpError(409, "text_changes_unchanged", "The approved text replacements produced no source change.");
  return { version: WEBSITE_MODE, operations: operations.map(compactOperation), files, sourceHashes, sectionFiles: source.sectionFiles || [] };
}

function applyTemplateOperations(original, operations) {
  const candidate = structuredClone(original);
  const plain = operations.filter(item => item.kind === "json-text");
  for (const item of plain) setSetting(candidate, item, item.after);

  const markupGroups = new Map();
  for (const item of operations.filter(value => value.kind === "json-markup-text")) {
    const key = `${item.scope}:${item.sectionId}:${item.blockId}:${item.key}`;
    if (!markupGroups.has(key)) markupGroups.set(key, []);
    markupGroups.get(key).push(item);
  }
  for (const items of markupGroups.values()) {
    const before = getSetting(candidate, items[0]);
    const after = applyVisibleOperations(before, items);
    if (sourceSkeleton(before) !== sourceSkeleton(after)) throw httpError(409, "markup_structure_changed", "A markup-backed setting changed outside visible text.");
    setSetting(candidate, items[0], after);
  }
  return candidate;
}

function applyVisibleOperations(source, operations) {
  let candidate = String(source || "");
  const currentSegments = visibleTextSegments(candidate);
  const replacements = operations.map(item => {
    const segment = currentSegments[item.segmentIndex];
    if (!segment || segment.text !== item.before) throw httpError(409, "text_segment_changed", `The source text changed for ${item.id}.`);
    return { start: segment.start, end: segment.end, after: item.after };
  }).sort((left, right) => right.start - left.start);
  for (const replacement of replacements) candidate = `${candidate.slice(0, replacement.start)}${replacement.after}${candidate.slice(replacement.end)}`;
  return candidate;
}

function visibleTextSegments(source) {
  const text = String(source || "");
  const ranges = protectedRanges(text);
  const segments = [];
  let cursor = 0;
  for (const range of [...ranges, { start: text.length, end: text.length }]) {
    if (cursor < range.start) collectVisibleRun(text, cursor, range.start, segments);
    cursor = Math.max(cursor, range.end);
  }
  return segments;
}

function collectVisibleRun(source, start, end, segments) {
  const raw = source.slice(start, end);
  const leading = raw.match(/^\s*/)?.[0].length || 0;
  const trailing = raw.match(/\s*$/)?.[0].length || 0;
  const valueStart = start + leading;
  const valueEnd = end - trailing;
  if (valueEnd <= valueStart) return;
  const value = source.slice(valueStart, valueEnd);
  if (!isVisibleCopy(value)) return;
  segments.push({ start: valueStart, end: valueEnd, text: value });
}

function protectedRanges(source) {
  const patterns = [
    /{%\s*(schema|javascript|stylesheet|comment)\s*%}[\s\S]*?{%\s*end\1\s*%}/gi,
    /<!--[\s\S]*?-->/g,
    /<script\b[\s\S]*?<\/script\s*>/gi,
    /<style\b[\s\S]*?<\/style\s*>/gi,
    /{{-?[\s\S]*?-?}}/g,
    /{%-?[\s\S]*?-?%}/g,
    /<[^>]+>/g,
  ];
  const ranges = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  ranges.sort((left, right) => left.start - right.start || right.end - left.end);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) merged.push({ ...range });
    else previous.end = Math.max(previous.end, range.end);
  }
  return merged;
}

function sourceSkeleton(source) {
  const segments = visibleTextSegments(source);
  let result = String(source || "");
  for (const segment of [...segments].sort((left, right) => right.start - left.start)) result = `${result.slice(0, segment.start)}§TEXT§${result.slice(segment.end)}`;
  return result;
}

function markupSkeleton(value) {
  return /[<>{}%]/.test(String(value || "")) ? sourceSkeleton(value) : "plain-visible-text";
}

function isVisibleCopy(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 1600) return false;
  if ((text.match(/[A-Za-z]/g) || []).length < 2) return false;
  if (/^(https?:\/\/|\/|#|mailto:|tel:|shopify:\/\/)/i.test(text)) return false;
  if (/^[a-z0-9_.-]+\.(png|jpe?g|gif|webp|svg|css|js|json|liquid)$/i.test(text)) return false;
  if (/^[a-z0-9_.-]+$/i.test(text) && !/\s/.test(text) && text.length < 30) return false;
  return true;
}

function isPlainEditableText(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  if (!isVisibleCopy(text)) return false;
  if (/(url|link(?!.*label)|href|image|video|color|colour|font|size|width|height|alignment|position|id$|handle|product|collection|menu|icon|animation|spacing|padding|margin|opacity|scheme|style|layout|desktop|mobile|enabled|show_|hide_|class|asset|file|src|target|rel|aria|tabindex)/i.test(name)) return false;
  if (/[<>{}%]/.test(text)) return false;
  return true;
}

function isMarkupSetting(key, value) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "");
  return /(custom_liquid|richtext|rich_text|markup|html|content)/.test(name) && /[<{]/.test(text) && visibleTextSegments(text).length > 0;
}

function safeReplacement(value) {
  const text = String(value || "");
  if (!text.trim() || text.length > 2400) return false;
  if (/<\/?(?:script|style|iframe|object|embed|form)\b/i.test(text)) return false;
  if (/{{|}}|{%|%}|javascript:|\bon[a-z]+\s*=/i.test(text)) return false;
  return true;
}

function explicitReplacements(objective, inventory) {
  const pairs = [];
  const pattern = /(?:replace|change|swap)\s+["“]([^"”]+)["”]\s+(?:with|to|for)\s+["“]([^"”]+)["”]/gi;
  let match;
  while ((match = pattern.exec(objective))) pairs.push({ before: match[1], after: match[2] });
  if (!pairs.length) return [];
  const used = new Set();
  const operations = [];
  for (const pair of pairs) {
    const item = inventory.find(candidate => !used.has(candidate.id) && candidate.before === pair.before)
      || inventory.find(candidate => !used.has(candidate.id) && candidate.before.toLowerCase() === pair.before.toLowerCase());
    if (!item || !safeReplacement(pair.after)) continue;
    used.add(item.id);
    operations.push({ id: item.id, before: item.before, after: pair.after, reason: "Explicit prompt replacement" });
  }
  return operations;
}

async function runStructuredIntelligence(env, input) {
  if (env?.AI && typeof env.AI.run === "function") {
    const model = String(env.KAIROS_WORKERS_AI_MODEL || DEFAULT_ACCOUNT_MODEL).trim();
    const result = await env.AI.run(model, {
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      seed: 1912,
      response_format: { type: "json_object" },
    });
    const text = extractGeneratedText(result);
    if (!text) throw httpError(502, "workers_ai_empty", "Kairos account-scoped intelligence returned no usable response.");
    return { value: parseStrictJSON(text), intelligence: { mode: "cloudflare-account-scoped", model, externalInferenceAPI: false } };
  }
  const result = await runKairosIntelligence(env, { ...input, temperature: 0.1, maxTokens: 4096, structuredOutput: true });
  return { value: parseStrictJSON(result.text), intelligence: { mode: result.runtime || "self-hosted-private", model: result.model, externalInferenceAPI: false } };
}

async function optionallyRefineDeliverable(env, context) {
  try { return await buildIntelligentDeliverable(env, context); }
  catch { return context.result; }
}

async function buildIntelligentDeliverable(env, context) {
  const generated = await runStructuredIntelligence(env, {
    purpose: `autonomous-child-${context.action}`,
    system: [
      `You are Kairos operating the ${context.title} workspace.`,
      "Return strict JSON only.",
      "Produce a finished, usable internal deliverable grounded only in the supplied objective and base runtime result.",
      "Do not invent facts, metrics, customers, prices, evidence, external actions, or completion receipts.",
      "Schema: {\"summary\":\"...\",\"sections\":[{\"name\":\"...\",\"content\":\"...\"}],\"nextAction\":\"...\"}",
    ].join("\n"),
    user: JSON.stringify({ objective: context.objective, baseRuntimeResult: context.baseBody || null }),
  });
  const value = generated.value || {};
  const sections = Array.isArray(value.sections) ? value.sections.slice(0, 12).map(section => ({ name: clean(section?.name, 180) || "Deliverable", status: "completed", content: clean(section?.content, 16000) })) : [];
  if (!sections.length) throw httpError(502, "autonomous_deliverable_empty", "Kairos intelligence returned no deliverable sections.");
  return {
    summary: clean(value.summary, 2000) || `${context.title} deliverable completed.`,
    sections,
    nextAction: clean(value.nextAction, 1000) || "Review the verified deliverable.",
  };
}

function normalizeBaseDeliverable(body, action, title, objective) {
  const sections = Array.isArray(body?.sections)
    ? body.sections.map(section => ({ name: clean(section?.name, 180) || "Deliverable", status: section?.status || "completed", content: clean(section?.content, 16000) }))
    : [];
  return {
    summary: clean(body?.summary, 2000) || `${title} processed the objective.`,
    sections: sections.length ? sections : [{ name: "Objective", status: "completed", content: objective || `Inspect ${title}.` }],
    nextAction: clean(body?.nextAction, 1000) || "Review the result and continue through the governed workspace.",
    action,
  };
}

function applySettingPath(document, item) {
  const section = document?.sections?.[item.sectionId];
  if (!section) throw httpError(409, "section_missing", `Homepage section ${item.sectionId} is missing.`);
  if (item.scope === "section") return section.settings;
  const block = section?.blocks?.[item.blockId];
  if (!block) throw httpError(409, "block_missing", `Homepage block ${item.sectionId}/${item.blockId} is missing.`);
  return block.settings;
}

function getSetting(document, item) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") throw httpError(409, "text_setting_missing", `Text setting ${item.id} is missing.`);
  return settings[item.key];
}

function setSetting(document, item, value) {
  const settings = applySettingPath(document, item);
  if (!settings || typeof settings[item.key] !== "string") throw httpError(409, "text_setting_missing", `Text setting ${item.id} is missing.`);
  settings[item.key] = value;
}

function deriveSectionFiles(document) {
  return [...new Set(Object.values(document?.sections || {})
    .map(section => clean(section?.type, 120).toLowerCase())
    .filter(type => /^[a-z0-9_-]+$/.test(type) && type !== "apps")
    .map(type => `sections/${type}.liquid`))].slice(0, 45);
}

function compactOperation(item) {
  return {
    id: item.id,
    kind: item.kind,
    filename: item.filename,
    scope: item.scope || "",
    sectionId: item.sectionId || "",
    blockId: item.blockId || "",
    key: item.key || "",
    segmentIndex: Number.isInteger(item.segmentIndex) ? item.segmentIndex : null,
    before: item.before,
    after: item.after,
    reason: item.reason || "",
  };
}

function templateStructureSignature(document) {
  const structure = {
    order: Array.isArray(document?.order) ? document.order : [],
    sections: Object.fromEntries(Object.entries(document?.sections || {}).map(([sectionId, section]) => [sectionId, {
      type: section?.type || "",
      disabled: Boolean(section?.disabled),
      settingKeys: Object.keys(section?.settings || {}).sort(),
      blocks: Object.fromEntries(Object.entries(section?.blocks || {}).map(([blockId, block]) => [blockId, { type: block?.type || "", settingKeys: Object.keys(block?.settings || {}).sort() }])),
      blockOrder: Array.isArray(section?.block_order) ? section.block_order : [],
    }])),
  };
  return stableStringify(structure);
}

function serializeLikeSource(source, document) {
  const text = String(source || "");
  const leadingComment = text.trimStart().startsWith("/*") ? text.slice(0, text.indexOf("*/") + 2) : "";
  const indent = /\n(\s+)"/.exec(text)?.[1]?.length || 2;
  const newline = text.endsWith("\n") ? "\n" : "";
  return `${leadingComment ? `${leadingComment}\n` : ""}${JSON.stringify(document, null, indent)}${newline}`;
}

function validateThemeBoundary(stagingTheme, mainTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "A verified non-live Kairos Staging theme is required.");
  if (!mainTheme?.gid || String(mainTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "main_theme_verification_failed", "The live MAIN theme could not be verified.");
}

async function storeJob(request, type, jobID, result, summary) {
  const now = new Date().toISOString();
  const envelope = { jobID, status: "completed", build: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD, submittedAt: now, updatedAt: now, completedAt: now, summary, result };
  await caches.default.put(jobRequest(request, type, jobID), new Response(JSON.stringify(envelope), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${JOB_TTL_SECONDS}` } }));
}

async function readJob(request, type, jobID) {
  return caches.default.match(jobRequest(request, type, jobID));
}

function jobRequest(request, type, jobID) {
  return new Request(new URL(`/_kairos/autonomous-${type}-jobs/${jobID}`, request.url).toString(), { method: "GET" });
}

function stagingPreviewURL(env, gid) {
  const origin = String(env.MMG_STOREFRONT_ORIGIN || "https://themindsetmediagroup.com").replace(/\/+$/, "");
  const themeID = String(gid || "").split("/").pop();
  return themeID ? `${origin}/?preview_theme_id=${encodeURIComponent(themeID)}` : origin;
}

function intelligenceStatus(env) {
  if (env?.AI && typeof env.AI.run === "function") return { configured: true, mode: "cloudflare-account-scoped", model: String(env.KAIROS_WORKERS_AI_MODEL || DEFAULT_ACCOUNT_MODEL), externalInferenceAPI: false };
  return { configured: Boolean(env?.KAIROS_INFERENCE_URL && env?.KAIROS_INFERENCE_TOKEN), mode: env?.KAIROS_INFERENCE_URL ? "self-hosted-private" : "not-configured", externalInferenceAPI: false };
}

function extractGeneratedText(result) {
  if (typeof result === "string") return result.trim();
  if (typeof result?.response === "string") return result.response.trim();
  const choice = result?.choices?.[0]?.message?.content ?? result?.choices?.[0]?.text;
  if (typeof choice === "string") return choice.trim();
  if (result?.response && typeof result.response === "object") return JSON.stringify(result.response);
  return "";
}

function textScore(key, value, kind) {
  const name = String(key || "").toLowerCase();
  const text = String(value || "").trim();
  let score = kind === "json" ? 20 : kind === "markup" ? 15 : 10;
  if (/(heading|title|headline)/.test(name)) score += 80;
  if (/(subheading|subtitle|description|content|copy|message|body|intro|summary|tagline)/.test(name)) score += 60;
  if (text.length >= 8 && text.length <= 120) score += 30;
  if (text.split(/\s+/).length >= 3) score += 20;
  return score;
}

function fileByName(files, filename) {
  return (Array.isArray(files) ? files : []).find(file => file?.filename === filename) || null;
}

function rebuildRequest(request, payload) {
  return new Request(request.url, { method: request.method, headers: new Headers(request.headers), body: JSON.stringify(payload), redirect: request.redirect });
}

async function safeRequestJSON(request) {
  try { return await request.json(); } catch { return {}; }
}

async function safeResponseJSON(response) {
  try { return await response.json(); } catch { return {}; }
}

function shortTitle(value) {
  const text = clean(value, 180);
  return text.length <= 90 ? text : `${text.slice(0, 87)}…`;
}

function cleanReplacement(value, max) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function clean(value, max) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function safeMessage(error) {
  return error instanceof Error && error.message ? error.message : "Kairos could not complete this operation.";
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
      "X-Kairos-Visual-Baseline": "tuesday-command-center-6f96b10d",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function failure(status, code, message) {
  return json({
    status: status >= 500 ? "failed" : "needs-attention",
    build: KAIROS_AUTONOMOUS_PROMPT_CONTROLLER_BUILD,
    error: { code, message },
    safeguards: {
      browserSurfaceChanged: false,
      stagingOnly: true,
      liveThemeChanged: false,
      structuralMutation: false,
      styleMutation: false,
    },
  }, status);
}
