const SHOPIFY_TIMEOUT_MS = 25_000;
const SHOPIFY_THEME_JOB_TIMEOUT_MS = 60_000;
const SHOPIFY_THEME_JOB_POLL_MS = 500;
const MD5_SHIFTS = Object.freeze([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]);
const MD5_CONSTANTS = Object.freeze(Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0));
const tokenCache = new Map();

export function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export async function safeJSON(response) {
  try { return await response.json(); }
  catch { return {}; }
}

export function parseShopifyJson(source, label = "Shopify JSON") {
  const text = String(source || "").replace(/^\uFEFF/, "");
  let jsonText = text;
  const trimmed = text.trimStart();
  if (trimmed.startsWith("/*")) {
    const startOffset = text.length - trimmed.length;
    const end = text.indexOf("*/", startOffset + 2);
    if (end === -1) throw httpError(409, "shopify_json_comment_unclosed", `${label} contains an unclosed leading Shopify comment.`);
    jsonText = text.slice(end + 2).trimStart();
  }
  try { return JSON.parse(jsonText); }
  catch (error) {
    throw httpError(409, "shopify_json_invalid", `${label} is invalid after Shopify comment normalization: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

export function validateHomepageDocument(candidate, original) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Homepage JSON must remain an object.");
  if (JSON.stringify(Object.keys(original).sort()) !== JSON.stringify(Object.keys(candidate).sort())) throw new Error("Top-level Shopify template keys changed.");
  if (!candidate.sections || typeof candidate.sections !== "object" || Array.isArray(candidate.sections)) throw new Error("sections must remain an object.");
  if (!Array.isArray(candidate.order)) throw new Error("order must remain an array.");
  const originalIDs = Object.keys(original.sections || {}).sort();
  const candidateIDs = Object.keys(candidate.sections || {}).sort();
  if (JSON.stringify(originalIDs) !== JSON.stringify(candidateIDs)) throw new Error("Section IDs were added or removed.");
  if (new Set(candidate.order).size !== candidate.order.length || candidate.order.length !== original.order.length || original.order.some(id => !candidate.order.includes(id))) throw new Error("Homepage order must contain every existing section exactly once.");
  for (const id of originalIDs) {
    const before = original.sections[id];
    const after = candidate.sections[id];
    if (before?.type !== after?.type) throw new Error(`Section type changed for ${id}.`);
    const beforeBlocks = before?.blocks && typeof before.blocks === "object" ? before.blocks : {};
    const afterBlocks = after?.blocks && typeof after.blocks === "object" ? after.blocks : {};
    const beforeBlockIDs = Object.keys(beforeBlocks).sort();
    const afterBlockIDs = Object.keys(afterBlocks).sort();
    if (JSON.stringify(beforeBlockIDs) !== JSON.stringify(afterBlockIDs)) throw new Error(`Block IDs changed for section ${id}.`);
    for (const blockID of beforeBlockIDs) if (beforeBlocks[blockID]?.type !== afterBlocks[blockID]?.type) throw new Error(`Block type changed for ${id}/${blockID}.`);
  }
}

export function buildEditableMap(document) {
  return {
    order: Array.isArray(document.order) ? document.order : [],
    sections: Object.entries(document.sections || {}).map(([sectionId, section]) => ({
      sectionId,
      type: section?.type || "",
      settings: section?.settings && typeof section.settings === "object" ? section.settings : {},
      blocks: Object.entries(section?.blocks || {}).map(([blockId, block]) => ({
        blockId,
        type: block?.type || "",
        settings: block?.settings && typeof block.settings === "object" ? block.settings : {},
      })),
    })),
  };
}

export function applyCompactPatch(original, patch) {
  const candidate = structuredClone(original);
  const order = Array.isArray(patch?.order) ? patch.order : [];
  if (order.length) candidate.order = [...order];
  const operations = Array.isArray(patch?.operations) ? patch.operations : [];
  if (operations.length > 250) throw new Error("The compact patch contains too many operations.");
  for (const operation of operations) {
    const scope = String(operation?.scope || "");
    const sectionId = String(operation?.sectionId || "");
    const blockId = String(operation?.blockId || "");
    const key = String(operation?.key || "");
    const section = candidate.sections?.[sectionId];
    if (!section) throw new Error(`Unknown section ID: ${sectionId}.`);
    let settings;
    if (scope === "section") {
      settings = section.settings;
      if (blockId) throw new Error(`Section operation ${sectionId}/${key} must not specify a block ID.`);
    } else if (scope === "block") {
      const block = section.blocks?.[blockId];
      if (!block) throw new Error(`Unknown block ID: ${sectionId}/${blockId}.`);
      settings = block.settings;
    } else {
      throw new Error(`Unsupported patch scope: ${scope}.`);
    }
    if (!settings || typeof settings !== "object" || !(key in settings)) throw new Error(`Unknown existing setting key: ${sectionId}/${blockId || "section"}/${key}.`);
    let value;
    try { value = JSON.parse(String(operation?.valueJson ?? "null")); }
    catch { throw new Error(`Invalid JSON value for ${sectionId}/${blockId || "section"}/${key}.`); }
    validateSettingValue(key, settings[key], value, `${sectionId}/${blockId || "section"}/${key}`);
    settings[key] = value;
  }
  validateHomepageDocument(candidate, original);
  return candidate;
}

function validateSettingValue(key, previous, next, location) {
  const previousType = Array.isArray(previous) ? "array" : previous === null ? "null" : typeof previous;
  const nextType = Array.isArray(next) ? "array" : next === null ? "null" : typeof next;
  if (previousType !== nextType) throw new Error(`Setting type changed at ${location}: ${previousType} to ${nextType}.`);
  const normalized = String(key || "").toLowerCase();
  if (typeof next === "string" && next.length > 100000) throw new Error(`Setting value is too large at ${location}.`);
  if (/(^|_)desktop_content_position$/.test(normalized) && !/^(top|middle|bottom)-(left|center|right)$/.test(next)) {
    throw new Error(`Invalid desktop content position at ${location}.`);
  }
  if (/(^|_)mobile_content_position$/.test(normalized) && !/^(top|middle|bottom)-(left|center|right)$/.test(next)) {
    throw new Error(`Invalid mobile content position at ${location}.`);
  }
  if (/(^|_)(desktop_content_alignment|mobile_content_alignment|text_alignment|alignment)$/.test(normalized) && !/^(left|center|right)$/.test(next)) {
    throw new Error(`Invalid alignment at ${location}.`);
  }
  if (/(^|_)image_height$/.test(normalized) && !/^(adapt|small|medium|large)$/.test(next)) {
    throw new Error(`Invalid image height at ${location}.`);
  }
  if (/(^|_)image_behavior$/.test(normalized) && !/^(none|ambient|fixed|zoom-in)$/.test(next)) {
    throw new Error(`Invalid image behavior at ${location}.`);
  }
}

export async function semanticHash(value) {
  const canonical = stableStringify(value);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function extractOutputText(body) {
  if (typeof body?.output_text === "string") return body.output_text;
  return (Array.isArray(body?.output) ? body.output : [])
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .filter(item => item?.type === "output_text" && typeof item?.text === "string")
    .map(item => item.text)
    .join("\n");
}

export function extractOpenAIError(body) {
  return String(body?.error?.message || body?.last_error?.message || body?.incomplete_details?.reason || "").trim();
}

export async function inspectStagingSource(_runtime, _request, env, build, requestedFilenames = ["templates/index.json"]) {
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const filenames = [...new Set((Array.isArray(requestedFilenames) ? requestedFilenames : [requestedFilenames]).map(value => String(value || "").trim()).filter(Boolean))];
  if (!filenames.length || filenames.length > 50) throw httpError(400, "theme_file_request_invalid", "Kairos must inspect between one and fifty theme files.");
  if (!filenames.includes("templates/index.json")) filenames.unshift("templates/index.json");
  const themesData = await shopifyGraphQL(config, auth, `query KairosThemes { themes(first: 20) { nodes { id name role processing processingFailed } } }`, {});
  const themes = Array.isArray(themesData?.themes?.nodes) ? themesData.themes.nodes : [];
  const mainTheme = themes.find(theme => theme?.role === "MAIN") || null;
  const stagingTheme = themes.find(theme => theme?.role !== "MAIN" && String(theme?.name || "").trim().toLowerCase() === "kairos staging") || null;
  if (!mainTheme?.id) throw httpError(409, "main_theme_not_found", "The live Rise theme could not be verified.");
  if (!stagingTheme?.id) throw httpError(409, "staging_theme_not_found", "Kairos Staging could not be verified.");
  if (stagingTheme.processing || stagingTheme.processingFailed) throw httpError(409, "staging_theme_not_ready", "Kairos Staging is still processing or failed processing.");

  const fileData = await shopifyGraphQL(config, auth, `query KairosHomepageFile($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename contentType body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } }`, {
    themeId: stagingTheme.id,
    filenames,
    first: filenames.length,
  });
  const connection = fileData?.theme?.files;
  const fileErrors = Array.isArray(connection?.userErrors) ? connection.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND") : [];
  if (fileErrors.length) throw httpError(502, "theme_file_read_failed", `Shopify could not read templates/index.json: ${fileErrors.map(error => error.code).join(", ")}.`);
  const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
  const files = [];
  for (const filename of filenames) {
    const node = nodes.find(item => item?.filename === filename);
    if (!node) continue;
    const content = bodyToText(node?.body);
    files.push({
      filename,
      readable: true,
      content,
      sha256: await hashText(content),
      bytes: new TextEncoder().encode(content).length,
      contentType: node?.contentType || "",
    });
  }
  if (!files.some(file => file.filename === "templates/index.json")) throw httpError(409, "homepage_source_unavailable", "templates/index.json was not readable from Kairos Staging.");
  return {
    actionID: crypto.randomUUID(),
    actionType: "shopify.staging.source.inspect",
    status: "completed",
    readOnly: true,
    build,
    completedAt: new Date().toISOString(),
    summary: "Kairos read the current non-live staging homepage directly from Shopify without using OpenAI.",
    evidence: {
      credentialPath: auth.credentialPath,
      mainTheme: summarizeTheme(mainTheme),
      stagingTheme: summarizeTheme(stagingTheme),
      files,
      missingFiles: filenames.filter(filename => !files.some(file => file.filename === filename)),
      openaiAPIUsed: false,
      sourceAdapter: "direct-shopify-graphql",
    },
  };
}

export async function inspectThemeFiles(env, themeGid, requestedFilenames = ["templates/index.json"]) {
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const filenames = [...new Set((Array.isArray(requestedFilenames) ? requestedFilenames : [requestedFilenames])
    .map(value => String(value || "").trim())
    .filter(Boolean))];
  if (!filenames.length || filenames.length > 50) {
    throw httpError(400, "theme_file_request_invalid", "Kairos must inspect between one and fifty theme files.");
  }

  const themesData = await shopifyGraphQL(config, auth, `query KairosThemes { themes(first: 20) { nodes { id name role processing processingFailed } } }`, {});
  const themes = Array.isArray(themesData?.themes?.nodes) ? themesData.themes.nodes : [];
  const normalizedThemeGid = normalizeThemeGid(themeGid);
  const theme = themes.find(item => normalizeThemeGid(item?.id) === normalizedThemeGid) || null;
  if (!theme?.id) throw httpError(409, "theme_not_found", "The approved Shopify theme could not be verified.");
  if (theme.processing || theme.processingFailed) throw httpError(409, "theme_not_ready", `${String(theme.name || "The approved theme")} is still processing or failed processing.`);

  const fileData = await shopifyGraphQL(config, auth, `query KairosThemeFiles($themeId: ID!, $filenames: [String!], $first: Int!) { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename contentType body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } }`, {
    themeId: theme.id,
    filenames,
    first: filenames.length,
  });
  const connection = fileData?.theme?.files;
  const fileErrors = Array.isArray(connection?.userErrors)
    ? connection.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND")
    : [];
  if (fileErrors.length) {
    throw httpError(502, "theme_file_read_failed", `Shopify could not read the approved theme files: ${fileErrors.map(error => error.code).join(", ")}.`);
  }

  const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
  const files = [];
  for (const filename of filenames) {
    const node = nodes.find(item => item?.filename === filename);
    if (!node) continue;
    const content = bodyToText(node?.body);
    files.push({
      filename,
      readable: true,
      content,
      sha256: await hashText(content),
      bytes: new TextEncoder().encode(content).length,
      contentType: node?.contentType || "",
    });
  }

  return {
    theme: summarizeTheme(theme),
    mainTheme: summarizeTheme(themes.find(item => item?.role === "MAIN") || null),
    files,
    missingFiles: filenames.filter(filename => !files.some(file => file.filename === filename)),
    credentialPath: auth.credentialPath,
  };
}

export async function writeThemeFile(env, themeGid, filename, content) {
  return writeThemeFiles(env, themeGid, [{ filename, content }]);
}

export async function writeThemeFiles(env, themeGid, files) {
  const normalized = Array.isArray(files) ? files.map(file => ({ filename: String(file?.filename || "").trim(), content: file?.content })) : [];
  if (!normalized.length || normalized.length > 50) throw httpError(400, "theme_file_write_invalid", "Kairos must write between one and fifty theme files.");
  if (normalized.some(file => !file.filename || typeof file.content !== "string")) throw httpError(400, "theme_file_write_invalid", "Every theme file write requires a filename and text content.");
  if (new Set(normalized.map(file => file.filename)).size !== normalized.length) throw httpError(400, "theme_file_write_duplicate", "Kairos will not write the same theme filename twice in one operation.");
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const dependencyFiles = normalized.filter(file => !file.filename.startsWith("templates/"));
  const templateFiles = normalized.filter(file => file.filename.startsWith("templates/"));
  const templateJobAnchor = dependencyFiles[0] || null;
  const templateBatches = templateFiles.map(file => templateJobAnchor ? [templateJobAnchor, file] : [file]);
  const batches = [dependencyFiles, ...templateBatches].filter(batch => batch.length);
  const operations = [];
  for (const batch of batches) operations.push(await writeThemeFileBatch(config, auth, themeGid, batch));
  const confirmationsByFilename = new Map();
  for (const operation of operations) {
    for (const confirmation of operation.confirmations) confirmationsByFilename.set(confirmation.filename, confirmation);
  }
  return {
    credentialPath: auth.credentialPath,
    mutationResult: operations.length === 1 ? operations[0].mutationResult : { operations: operations.map(operation => operation.mutationResult) },
    job: operations.length === 1 ? operations[0].job : null,
    jobs: operations.map(operation => operation.job).filter(Boolean),
    operations: operations.map(operation => ({ filenames: operation.filenames, job: operation.job, confirmations: operation.confirmations })),
    confirmations: normalized.map(file => confirmationsByFilename.get(file.filename)).filter(Boolean),
    filenames: normalized.map(file => file.filename),
  };
}

async function writeThemeFileBatch(config, auth, themeGid, normalized) {
  const query = `mutation KairosThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $themeId, files: $files) { job { id done } upsertedThemeFiles { filename checksumMd5 size updatedAt } userErrors { field message } } }`;
  const data = await shopifyGraphQL(config, auth, query, { themeId: themeGid, files: normalized.map(file => ({ filename: file.filename, body: { type: "TEXT", value: file.content } })) });
  const payload = data?.themeFilesUpsert;
  const errors = Array.isArray(payload?.userErrors) ? payload.userErrors.filter(error => error?.message) : [];
  if (errors.length) throw httpError(422, "theme_file_write_rejected", errors.map(error => error.message).join("; "));
  const written = Array.isArray(payload?.upsertedThemeFiles) ? payload.upsertedThemeFiles : [];
  const unconfirmed = normalized.map(file => file.filename).filter(filename => !written.some(file => file?.filename === filename));
  if (unconfirmed.length && !payload?.job?.id) throw httpError(502, "theme_file_write_unconfirmed", `Shopify did not confirm writing: ${unconfirmed.join(", ")}.`);
  const job = await waitForThemeFileWriteJob(config, auth, payload?.job, themeGid, normalized);
  const writtenByName = new Map(written.map(file => [file.filename, file]));
  const jobByName = new Map((job?.files || []).map(file => [file.filename, file]));
  const confirmations = [];
  for (const expected of normalized) {
    const operationResult = writtenByName.get(expected.filename);
    const jobResult = jobByName.get(expected.filename);
    const expectedSha256 = await hashText(expected.content);
    const expectedChecksumMd5 = md5Text(expected.content);
    const expectedBytes = new TextEncoder().encode(expected.content).length;
    if (!operationResult && !jobResult) {
      throw httpError(502, "theme_file_write_result_missing", "Shopify returned no successful operation receipt for " + expected.filename + ".");
    }
    const jobByteMatched = jobResult?.sha256 === expectedSha256;
    const jobSemanticMatched = !jobByteMatched && jobResult?.content && expected.filename.endsWith(".json")
      ? await jsonSemanticallyMatches(jobResult.content, expected.content)
      : false;
    const reportedBytes = operationResult?.size === null || operationResult?.size === undefined || operationResult?.size === "" ? null : Number(operationResult.size);
    const actualChecksumMd5 = normalizeMd5(operationResult?.checksumMd5);
    const checksumMatched = actualChecksumMd5 ? actualChecksumMd5 === expectedChecksumMd5 : null;
    const restVerification = jobByteMatched || jobSemanticMatched || checksumMatched
      ? null
      : await verifyThemeFileViaRest(config, auth, themeGid, expected, expectedSha256);
    const byteMatched = Boolean(jobByteMatched || checksumMatched || restVerification?.byteMatched);
    const semanticMatched = Boolean(jobSemanticMatched || restVerification?.semanticMatched);
    if (!byteMatched && !semanticMatched) {
      throw httpError(502, "theme_file_write_integrity_mismatch", "Shopify did not return the approved " + expected.filename + " through its write job, checksum receipt, or Asset read-back.");
    }
    const method = jobByteMatched
      ? (checksumMatched ? "operation-result-and-job-query" : "job-query-sha256")
      : jobSemanticMatched
        ? "job-query-semantic-json"
        : checksumMatched
          ? "operation-result-checksum-md5"
          : restVerification.byteMatched
            ? "rest-asset-sha256"
            : "rest-asset-semantic-json";
    confirmations.push({
      filename: expected.filename,
      matched: true,
      method,
      matchType: byteMatched ? "bytes" : "semantic-json",
      expectedSha256,
      actualSha256: jobResult?.sha256 || restVerification?.sha256 || expectedSha256,
      byteMatched,
      semanticMatched,
      expectedChecksumMd5,
      actualChecksumMd5: actualChecksumMd5 || null,
      checksumMatched,
      expectedBytes,
      actualBytes: jobResult?.bytes ?? restVerification?.bytes ?? expectedBytes,
      reportedBytes,
      sizeMatched: Number.isFinite(reportedBytes) ? reportedBytes === expectedBytes : null,
      updatedAt: operationResult?.updatedAt || null,
      restReadbackAttempts: restVerification?.attempts || 0,
    });
  }
  return { mutationResult: payload, job, confirmations, filenames: normalized.map(file => file.filename) };
}

async function verifyThemeFileViaRest(config, auth, themeGid, expected, expectedSha256) {
  const delays = [0, 250, 500, 1_000, 2_000, 3_000, 5_000];
  for (let index = 0; index < delays.length; index += 1) {
    if (delays[index]) await new Promise(resolve => setTimeout(resolve, delays[index]));
    const asset = await readThemeFileViaRest(config, auth, themeGid, expected.filename);
    const sha256 = await hashText(asset.content);
    const bytes = new TextEncoder().encode(asset.content).length;
    const byteMatched = sha256 === expectedSha256;
    const semanticMatched = !byteMatched && expected.filename.endsWith(".json")
      ? await jsonSemanticallyMatches(asset.content, expected.content)
      : false;
    const verification = { ...asset, sha256, bytes, byteMatched, semanticMatched, attempts: index + 1 };
    if (byteMatched || semanticMatched) return verification;
  }
  throw httpError(502, "theme_file_rest_verification_mismatch", "Shopify's Asset read-back did not converge to the approved " + expected.filename + ".");
}

async function readThemeFileViaRest(config, auth, themeGid, filename) {
  const themeID = normalizeThemeGid(themeGid).match(/\d+$/)?.[0] || "";
  if (!themeID) throw httpError(400, "theme_id_invalid", "The Shopify theme ID is invalid.");
  const url = new URL(`https://${config.storeDomain}/admin/api/${config.apiVersion}/themes/${themeID}/assets.json`);
  url.searchParams.set("asset[key]", filename);
  url.searchParams.set("fields", "key,value,checksum,size,updated_at");
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": auth.token, Accept: "application/json", "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  const asset = body?.asset;
  if (!response.ok || typeof asset?.value !== "string") {
    throw httpError(response.status || 502, "theme_file_rest_read_failed", "Shopify's Asset API could not read " + filename + " after the write.");
  }
  return {
    filename: String(asset.key || filename),
    content: asset.value,
    checksumMd5: normalizeMd5(asset.checksum),
    size: asset.size === null || asset.size === undefined ? null : Number(asset.size),
    updatedAt: asset.updated_at || null,
  };
}

async function jsonSemanticallyMatches(actualContent, expectedContent) {
  try {
    return await semanticHash(JSON.parse(actualContent)) === await semanticHash(JSON.parse(expectedContent));
  } catch {
    return false;
  }
}

async function waitForThemeFileWriteJob(config, auth, initialJob, themeGid, expectedFiles) {
  const id = String(initialJob?.id || "").trim();
  if (!id) return null;

  const deadline = Date.now() + SHOPIFY_THEME_JOB_TIMEOUT_MS;
  let polls = 0;
  let delayBeforePoll = initialJob?.done !== true;
  let completedWithoutResult = false;
  while (Date.now() < deadline) {
    if (delayBeforePoll) await new Promise(resolve => setTimeout(resolve, SHOPIFY_THEME_JOB_POLL_MS));
    delayBeforePoll = true;
    const filenames = expectedFiles.map(file => file.filename);
    const data = await shopifyGraphQL(config, auth, `query KairosThemeFileJob($id: ID!, $themeId: ID!, $filenames: [String!], $first: Int!) { job(id: $id) { id done query { theme(id: $themeId) { files(first: $first, filenames: $filenames) { nodes { filename contentType body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } } userErrors { code filename } } } } } }`, { id, themeId: themeGid, filenames, first: filenames.length });
    const job = data?.job;
    polls += 1;
    if (!job?.id) throw httpError(502, "theme_file_write_job_missing", "Shopify accepted the theme file write but its completion job could not be verified.");
    if (job.done !== true) continue;
    const connection = job?.query?.theme?.files;
    if (!connection) {
      completedWithoutResult = true;
      continue;
    }
    const fileErrors = Array.isArray(connection.userErrors) ? connection.userErrors.filter(error => error?.code && error.code !== "NOT_FOUND") : [];
    if (fileErrors.length) throw httpError(502, "theme_file_write_job_result_failed", "Shopify's completed write job could not read its resulting theme files: " + fileErrors.map(error => error.code).join(", ") + ".");
    const nodes = Array.isArray(connection.nodes) ? connection.nodes : [];
    const files = [];
    for (const filename of filenames) {
      const node = nodes.find(item => item?.filename === filename);
      if (!node) continue;
      const content = bodyToText(node.body);
      files.push({ filename, content, sha256: await hashText(content), bytes: new TextEncoder().encode(content).length, contentType: node.contentType || "" });
    }
    return { id: String(job.id), done: true, polls, files };
  }
  if (completedWithoutResult) throw httpError(502, "theme_file_write_job_result_missing", "Shopify completed the theme file write job, but its authoritative result never became readable.");
  throw httpError(504, "theme_file_write_job_timeout", "Shopify accepted the theme file write, but it did not finish before the verification deadline. Kairos did not perform read-back against an incomplete write.");
}

export async function deleteThemeFiles(env, themeGid, filenames) {
  const normalized = [...new Set((Array.isArray(filenames) ? filenames : []).map(value => String(value || "").trim()).filter(Boolean))];
  if (!normalized.length || normalized.length > 50) throw httpError(400, "theme_file_delete_invalid", "Kairos must delete between one and fifty theme files.");
  if (normalized.includes("templates/index.json")) throw httpError(400, "homepage_template_delete_forbidden", "Kairos will never delete the Shopify homepage template.");
  const config = readShopifyConfig(env);
  const auth = await resolveAccessToken(config, env);
  const query = `mutation KairosThemeFilesDelete($themeId: ID!, $files: [String!]!) { themeFilesDelete(themeId: $themeId, files: $files) { deletedThemeFiles { filename } userErrors { field message } } }`;
  const data = await shopifyGraphQL(config, auth, query, { themeId: themeGid, files: normalized });
  const payload = data?.themeFilesDelete;
  const errors = Array.isArray(payload?.userErrors) ? payload.userErrors.filter(error => error?.message) : [];
  if (errors.length) throw httpError(422, "theme_file_delete_rejected", errors.map(error => error.message).join("; "));
  const deleted = Array.isArray(payload?.deletedThemeFiles) ? payload.deletedThemeFiles : [];
  const unconfirmed = normalized.filter(filename => !deleted.some(file => file?.filename === filename));
  if (unconfirmed.length) throw httpError(502, "theme_file_delete_unconfirmed", `Shopify did not confirm deleting: ${unconfirmed.join(", ")}.`);
  return { credentialPath: auth.credentialPath, mutationResult: payload, filenames: normalized };
}

function summarizeTheme(theme) {
  return theme?.id
    ? { gid: theme.id, name: String(theme.name || ""), role: String(theme.role || ""), processing: Boolean(theme.processing), processingFailed: Boolean(theme.processingFailed) }
    : null;
}

function normalizeThemeGid(value) {
  const text = String(value || "").trim();
  const numeric = text.match(/(\d+)(?!.*\d)/)?.[1];
  return numeric ? `gid://shopify/OnlineStoreTheme/${numeric}` : text;
}

function bodyToText(body) {
  if (typeof body?.content === "string") return body.content;
  if (typeof body?.contentBase64 === "string") {
    try { return atob(body.contentBase64); }
    catch { return ""; }
  }
  return "";
}

export async function hashText(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function md5Text(value) {
  const input = new TextEncoder().encode(String(value || ""));
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, (input.length * 8) >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(input.length / 0x20000000) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f;
      let g;
      if (index < 16) { f = (b & c) | (~b & d); g = index; }
      else if (index < 32) { f = (d & b) | (~d & c); g = (5 * index + 1) % 16; }
      else if (index < 48) { f = b ^ c ^ d; g = (3 * index + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * index) % 16; }
      const sum = (a + f + MD5_CONSTANTS[index] + words[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(sum, MD5_SHIFTS[index])) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0].map(word => [0, 8, 16, 24].map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}

function rotateLeft(value, shift) { return ((value << shift) | (value >>> (32 - shift))) >>> 0; }
function normalizeMd5(value) { return String(value || "").trim().toLowerCase().replace(/^md5:/, ""); }

function readShopifyConfig(env) {
  const storeDomain = String(env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const apiVersion = String(env.SHOPIFY_API_VERSION || "2026-07").trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) throw httpError(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) throw httpError(503, "shopify_invalid_version", "The Shopify API version is invalid.");
  return { storeDomain, apiVersion };
}

async function resolveAccessToken(config, env) {
  const clientId = String(env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env.SHOPIFY_CLIENT_SECRET || "").trim();
  if (clientId && clientSecret) {
    const cacheKey = `${config.storeDomain}:${clientId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached?.expiresAt > Date.now()) return { token: cached.token, credentialPath: "client-credentials" };
    const response = await fetch(`https://${config.storeDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    });
    const body = await safeJSON(response);
    const token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
    if (!response.ok || !token) throw httpError(response.status === 429 ? 429 : 401, "shopify_client_credentials_invalid", String(body?.error_description || body?.error || `Shopify token request returned HTTP ${response.status}.`).slice(0, 500));
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { token, credentialPath: "client-credentials" };
  }
  const token = String(env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
  if (!token) throw httpError(503, "shopify_not_configured", "Shopify client credentials or an Admin access token must be configured.");
  return { token, credentialPath: "admin-access-token" };
}

async function shopifyGraphQL(config, auth, query, variables) {
  const response = await fetch(`https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": auth.token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  const body = await safeJSON(response);
  if (!response.ok) throw httpError(response.status, "shopify_graphql_http_error", body?.errors?.[0]?.message || `Shopify GraphQL returned HTTP ${response.status}.`);
  if (Array.isArray(body?.errors) && body.errors.length) throw httpError(422, "shopify_graphql_error", body.errors.map(error => error?.message).filter(Boolean).join("; "));
  return body?.data || {};
}
