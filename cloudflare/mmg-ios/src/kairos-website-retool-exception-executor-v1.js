import {
  hashText,
  inspectStagingSource,
  parseShopifyJson,
  semanticHash,
  writeThemeFile,
} from "./kairos-compact-homepage-utils-v1.js";

const BUILD = "kairos-website-retool-exception-executor-20260713-1";
const MAX_FILES = 6;
const MIN_AUTO_CONFIDENCE = 0.95;

export async function executeWebsiteRetoolExceptions(request, env, payload) {
  const approval = payload?.approval || {};
  const plan = payload?.plan || {};
  if (approval.status !== "approved") throw new Error("Executive approval is required before applying website retool exceptions.");
  if (!plan?.stagingTheme?.gid) throw new Error("The approved website retool plan does not identify Kairos Staging.");
  if (approval.targetThemeID !== plan.stagingTheme.gid) throw new Error("The approved target theme does not match the website retool plan.");

  const selected = normalizeSelectedChanges(payload?.selectedChanges, plan);
  if (!selected.length) throw new Error("No approved website retool exception changes were selected.");

  const filenames = [...new Set(selected.map(item => item.filename))];
  if (filenames.length > MAX_FILES) throw new Error("The website retool exception package exceeds the governed file limit.");
  if (filenames.some(name => !/\.json$/i.test(name))) throw new Error("Liquid or asset mutation is not authorized in this execution slice.");

  const inspection = await inspectStagingSource(null, request, env, BUILD, filenames);
  const evidence = inspection?.evidence || {};
  if (evidence?.stagingTheme?.gid !== plan.stagingTheme.gid) throw new Error("Kairos Staging no longer matches the approved plan.");
  if (evidence?.stagingTheme?.role === "MAIN") throw new Error("The target theme is live. Execution was blocked.");

  const files = new Map((evidence.files || []).filter(file => file?.readable && file?.content).map(file => [file.filename, file]));
  const writes = [];
  const receipts = [];
  const rollbackFiles = [];

  for (const filename of filenames) {
    const source = files.get(filename);
    if (!source?.content) throw new Error(`Approved source file is unavailable: ${filename}.`);
    const approvedHashes = new Set(selected.filter(item => item.filename === filename).map(item => item.sourceSha256));
    if (approvedHashes.size !== 1 || !approvedHashes.has(source.sha256)) throw new Error(`Source hash changed after approval: ${filename}. Generate a new plan.`);

    const original = parseShopifyJson(source.content, `${filename} before website retool exceptions`);
    const candidate = structuredClone(original);
    const fileChanges = selected.filter(item => item.filename === filename);

    for (const change of fileChanges) {
      const before = getAtPath(candidate, change.path);
      validateChange(change, before);
      setAtPath(candidate, change.path, change.proposedValue);
      receipts.push({
        filename,
        path: change.path,
        key: change.key,
        authorizedChange: change.authorizedChange,
        before,
        after: change.proposedValue,
        confidence: change.confidence,
        rationale: change.rationale,
      });
    }

    assertOnlyApprovedPathsChanged(original, candidate, fileChanges.map(item => item.path));
    const content = `${JSON.stringify(candidate, null, 2)}\n`;
    writes.push({ filename, content, expectedSemanticHash: await semanticHash(candidate) });
    rollbackFiles.push({ filename, sourceSha256: source.sha256, content: source.content });
  }

  for (const write of writes) await writeThemeFile(env, evidence.stagingTheme.gid, write.filename, write.content);

  const readBack = await inspectStagingSource(null, request, env, BUILD, filenames);
  const verifiedFiles = [];
  for (const write of writes) {
    const actual = readBack?.evidence?.files?.find(file => file.filename === write.filename && file.readable);
    if (!actual?.content) throw new Error(`Shopify returned no read-back for ${write.filename}.`);
    const parsed = parseShopifyJson(actual.content, `${write.filename} after website retool exceptions`);
    const actualSemanticHash = await semanticHash(parsed);
    if (actualSemanticHash !== write.expectedSemanticHash) throw new Error(`Shopify read-back did not match the approved result for ${write.filename}.`);
    verifiedFiles.push({ filename: write.filename, sha256: await hashText(actual.content), semanticHash: actualSemanticHash, verified: true });
  }

  return {
    status: "completed",
    build: BUILD,
    completedAt: new Date().toISOString(),
    summary: `${receipts.length} authorized website retool exception change${receipts.length === 1 ? "" : "s"} applied and verified on Kairos Staging.`,
    execution: {
      targetTheme: evidence.stagingTheme,
      publishedTheme: evidence.mainTheme,
      publishedThemeChanged: false,
      productionPublishAuthorized: false,
      filesWritten: verifiedFiles,
    },
    receipts,
    rollback: {
      required: false,
      authorized: false,
      targetThemeID: evidence.stagingTheme.gid,
      files: rollbackFiles,
      instruction: "Rollback requires a separate approved request containing this exact rollback package.",
    },
    safeguards: {
      stagingOnly: true,
      liveThemeChanged: false,
      sourceHashBound: true,
      exactPathMutationOnly: true,
      liquidMutation: false,
      visualVerificationRequiredBeforePublication: true,
    },
  };
}

export async function rollbackWebsiteRetoolExceptions(request, env, payload) {
  const approval = payload?.approval || {};
  const rollback = payload?.rollback || {};
  if (approval.status !== "approved") throw new Error("Executive approval is required before website retool rollback.");
  if (!rollback?.targetThemeID || approval.targetThemeID !== rollback.targetThemeID) throw new Error("Rollback target approval does not match the rollback package.");
  const files = Array.isArray(rollback.files) ? rollback.files : [];
  if (!files.length || files.length > MAX_FILES) throw new Error("The rollback package is invalid.");
  if (files.some(file => !/\.json$/i.test(String(file?.filename || "")) || typeof file?.content !== "string")) throw new Error("Rollback contains an unauthorized file type.");

  const filenames = files.map(file => file.filename);
  const inspection = await inspectStagingSource(null, request, env, BUILD, filenames);
  if (inspection?.evidence?.stagingTheme?.gid !== rollback.targetThemeID) throw new Error("Kairos Staging no longer matches the rollback package.");
  if (inspection?.evidence?.stagingTheme?.role === "MAIN") throw new Error("Rollback target is live. Operation blocked.");

  for (const file of files) {
    parseShopifyJson(file.content, `${file.filename} rollback source`);
    await writeThemeFile(env, rollback.targetThemeID, file.filename, file.content);
  }

  const readBack = await inspectStagingSource(null, request, env, BUILD, filenames);
  const verification = [];
  for (const file of files) {
    const actual = readBack?.evidence?.files?.find(item => item.filename === file.filename && item.readable);
    if (!actual?.content) throw new Error(`Shopify returned no rollback read-back for ${file.filename}.`);
    const actualHash = await hashText(actual.content);
    const expectedHash = await hashText(file.content);
    if (actualHash !== expectedHash) throw new Error(`Rollback read-back mismatch for ${file.filename}.`);
    verification.push({ filename: file.filename, expectedHash, actualHash, verified: true });
  }

  return {
    status: "completed",
    build: BUILD,
    completedAt: new Date().toISOString(),
    summary: `${verification.length} website retool file${verification.length === 1 ? "" : "s"} restored on Kairos Staging.`,
    targetTheme: inspection.evidence.stagingTheme,
    publishedTheme: inspection.evidence.mainTheme,
    publishedThemeChanged: false,
    verification,
    safeguards: { stagingOnly: true, liveThemeChanged: false, exactRollbackPackage: true },
  };
}

function normalizeSelectedChanges(input, plan) {
  const allowed = [...(Array.isArray(plan.highConfidence) ? plan.highConfidence : []), ...(Array.isArray(plan.executiveReview) ? plan.executiveReview : [])];
  const selected = Array.isArray(input) && input.length ? input : (plan.highConfidence || []);
  return selected.map(item => {
    const match = allowed.find(candidate => sameChange(candidate, item));
    if (!match) throw new Error("A selected website retool change is not present in the approved plan.");
    if (match.proposedValue === null || match.proposedValue === undefined) throw new Error(`The approved value is unresolved for ${match.filename}/${match.key}.`);
    if (Number(match.confidence) < MIN_AUTO_CONFIDENCE && item?.executiveDecision !== "approved") throw new Error(`Explicit executive approval is required for ${match.filename}/${match.key}.`);
    return match;
  });
}

function sameChange(a, b) {
  return a?.filename === b?.filename && JSON.stringify(a?.path) === JSON.stringify(b?.path) && a?.key === b?.key;
}

function validateChange(change, before) {
  if (!Array.isArray(change.path) || !change.path.length) throw new Error("Approved change path is invalid.");
  if (typeof before !== change.valueType) throw new Error(`Setting type changed before execution for ${change.filename}/${change.key}.`);
  if (typeof change.proposedValue !== change.valueType) throw new Error(`Proposed setting type is invalid for ${change.filename}/${change.key}.`);
  if (!/^(header-branding|footer-payment|footer-attribution|visual-color|layout-exception-candidate|visibility-or-content)$/.test(String(change.category || ""))) throw new Error("Change category is not authorized.");
}

function getAtPath(root, path) {
  return path.reduce((value, key) => value?.[key], root);
}

function setAtPath(root, path, value) {
  let cursor = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) throw new Error(`Unknown approved setting path: ${path.join(".")}.`);
    cursor = cursor[key];
  }
  const finalKey = path[path.length - 1];
  if (!cursor || typeof cursor !== "object" || !(finalKey in cursor)) throw new Error(`Unknown approved setting path: ${path.join(".")}.`);
  cursor[finalKey] = value;
}

function assertOnlyApprovedPathsChanged(before, after, approvedPaths) {
  const approved = new Set(approvedPaths.map(path => JSON.stringify(path)));
  const changes = [];
  diff(before, after, [], changes);
  const unauthorized = changes.filter(path => !approved.has(JSON.stringify(path)));
  if (unauthorized.length) throw new Error(`Unauthorized website retool changes detected: ${unauthorized.map(path => path.join(".")).join(", ")}.`);
}

function diff(before, after, path, output) {
  if (Object.is(before, after)) return;
  const beforeObject = before && typeof before === "object";
  const afterObject = after && typeof after === "object";
  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
    output.push(path);
    return;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) diff(before?.[key], after?.[key], [...path, Array.isArray(before) ? Number(key) : key], output);
}
