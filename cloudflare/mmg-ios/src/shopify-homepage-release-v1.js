import {
  deleteThemeFiles,
  httpError,
  inspectThemeFiles,
  writeThemeFiles,
} from "./kairos-compact-homepage-utils-v1.js";

const BUILD = "shopify-homepage-release-20260715-1";
const CACHE_SECONDS = 60 * 60 * 24 * 7;
const PUBLISH_CONFIRMATION = "APPLY APPROVED HOMEPAGE";
const ROLLBACK_CONFIRMATION = "ROLL BACK APPROVED HOMEPAGE";

export async function handleHomepageReleaseRequest(request, env) {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/shopify/homepage-release/prepare" && request.method === "POST") {
      return json(publicRecord(await prepareRelease(request, env)), 201);
    }
    if (url.pathname === "/api/shopify/homepage-release/publish" && request.method === "POST") {
      return json(publicRecord(await publishRelease(request, env)));
    }
    if (url.pathname === "/api/shopify/homepage-release/rollback" && request.method === "POST") {
      return json(publicRecord(await rollbackRelease(request, env)));
    }
    const match = url.pathname.match(/^\/api\/shopify\/homepage-release\/records\/([a-f0-9-]+)$/i);
    if (match && request.method === "GET") {
      const record = await loadRelease(request, match[1]);
      return record ? json(publicRecord(record)) : json(errorBody("release_not_found", "The homepage release record expired or was not found."), 404);
    }
    return null;
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500);
    return json(errorBody(error?.code || "homepage_release_failed", safeMessage(error)), status);
  }
}

async function prepareRelease(request, env) {
  const body = await request.json();
  const reviewID = String(body?.reviewID || "").trim();
  if (!reviewID) throw httpError(400, "review_id_required", "An approved homepage visual review is required.");

  const reviewResponse = await caches.default.match(reviewRequest(request, reviewID));
  if (!reviewResponse) throw httpError(404, "visual_review_not_found", "The approved visual review expired or was not found.");
  const review = await reviewResponse.json();
  if (review?.status !== "visual-review-approved" || review?.executiveDecision?.decision !== "approved") {
    throw httpError(409, "visual_approval_required", "Approve the rendered staging preview before applying the homepage to the live storefront.");
  }

  const target = review?.releaseTarget || {};
  if (target.releaseType !== "theme-publication") throw httpError(409, "homepage_release_target_invalid", "This release is not a homepage theme-file promotion.");
  const approvedFiles = normalizeApprovedFiles(target.approvedFiles);
  const filenames = approvedFiles.map(file => file.filename);
  const stagingThemeID = target?.stagingTheme?.gid || target?.stagingTheme?.id;
  const liveThemeID = target?.publishedTheme?.gid || target?.publishedTheme?.id;
  if (!stagingThemeID || !liveThemeID) throw httpError(409, "homepage_release_themes_missing", "The approved staging and live Shopify themes are required.");

  const [staging, live] = await Promise.all([
    inspectThemeFiles(env, stagingThemeID, filenames),
    inspectThemeFiles(env, liveThemeID, filenames),
  ]);
  validateThemeBoundary(staging.theme, live.theme);
  const stagingByName = fileMap(staging.files);
  const liveByName = fileMap(live.files);
  const files = approvedFiles.map(approved => {
    const source = stagingByName.get(approved.filename);
    if (!source || typeof source.content !== "string") throw httpError(409, "approved_staging_file_missing", `${approved.filename} is no longer available on Kairos Staging.`);
    if (source.sha256 !== approved.afterSha256) throw httpError(409, "approved_staging_hash_changed", `${approved.filename} changed after visual approval. Build and approve a new preview.`);
    const before = liveByName.get(approved.filename) || null;
    return {
      filename: approved.filename,
      stagingSha256: source.sha256,
      stagingContent: source.content,
      liveBeforeExisted: Boolean(before),
      liveBeforeSha256: before?.sha256 || null,
      liveBeforeContent: before?.content ?? null,
    };
  });

  const now = new Date().toISOString();
  const record = {
    releaseID: crypto.randomUUID(),
    reviewID,
    build: BUILD,
    status: "awaiting-live-approval",
    createdAt: now,
    updatedAt: now,
    preview: review.preview,
    visualDecision: review.executiveDecision,
    targetTheme: staging.theme,
    liveTheme: live.theme,
    files,
    safeguards: {
      explicitPublicationApprovalRequired: true,
      expectedConfirmation: PUBLISH_CONFIRMATION,
      sourceHashesBound: true,
      liveHashesBound: true,
      stagingThemeRemainsUnpublished: true,
      liveThemeRoleRemainsMain: true,
      postWriteReadbackRequired: true,
      automaticRecoveryOnVerificationFailure: true,
      rollbackAvailable: true,
    },
    publication: null,
    rollback: null,
  };
  await saveRelease(request, record);
  return record;
}

async function publishRelease(request, env) {
  const body = await request.json();
  const releaseID = String(body?.releaseID || "").trim();
  const confirmation = String(body?.confirmation || "").trim();
  if (!releaseID) throw httpError(400, "release_id_required", "Homepage release ID is required.");
  if (confirmation !== PUBLISH_CONFIRMATION) throw httpError(403, "publication_confirmation_required", `Confirm ${PUBLISH_CONFIRMATION} before applying the approved homepage.`);
  const record = await loadRelease(request, releaseID);
  if (!record) throw httpError(404, "release_not_found", "The homepage release record expired or was not found.");
  if (record.status !== "awaiting-live-approval") throw httpError(409, "release_state_invalid", "This homepage release is not awaiting live approval.");

  const filenames = record.files.map(file => file.filename);
  const [staging, live] = await Promise.all([
    inspectThemeFiles(env, record.targetTheme.gid, filenames),
    inspectThemeFiles(env, record.liveTheme.gid, filenames),
  ]);
  validateThemeBoundary(staging.theme, live.theme);
  validateBoundFiles(record, staging.files, live.files);

  let liveWriteStarted = false;
  try {
    const write = await writeThemeFiles(env, live.theme.gid, record.files.map(file => ({ filename: file.filename, content: file.stagingContent })));
    liveWriteStarted = true;
    const verified = await inspectThemeFiles(env, live.theme.gid, filenames);
    validatePublishedFiles(record, verified.files);
    const liveProbe = await probeLive(env);
    if (!liveProbe.ok) throw httpError(502, "live_storefront_probe_failed", "The approved files were written, but the live storefront did not pass verification.");
    const now = new Date().toISOString();
    record.status = "published-and-verified";
    record.updatedAt = now;
    record.publication = {
      actor: String(body?.actor || "Executive").trim().slice(0, 120) || "Executive",
      approvedAt: now,
      confirmation,
      credentialPath: write.credentialPath,
      mutationResult: write.mutationResult,
      files: record.files.map(file => ({ filename: file.filename, beforeSha256: file.liveBeforeSha256, afterSha256: file.stagingSha256 })),
      liveProbe,
    };
    await saveRelease(request, record);
    return record;
  } catch (error) {
    if (liveWriteStarted) {
      const recovery = await restoreLiveSnapshot(env, record).catch(recoveryError => ({
        restored: false,
        error: safeMessage(recoveryError),
      }));
      record.status = recovery.restored ? "publication-failed-auto-restored" : "publication-failed-recovery-required";
      record.updatedAt = new Date().toISOString();
      record.publicationFailure = { error: safeMessage(error), recovery };
      await saveRelease(request, record);
      if (recovery.restored) throw httpError(502, "publication_verification_failed_auto_restored", "Live verification failed, so Kairos automatically restored the previous homepage. Review the release receipt before retrying.");
    }
    throw error;
  }
}

async function rollbackRelease(request, env) {
  const body = await request.json();
  const releaseID = String(body?.releaseID || "").trim();
  const confirmation = String(body?.confirmation || "").trim();
  if (!releaseID) throw httpError(400, "release_id_required", "Homepage release ID is required.");
  if (confirmation !== ROLLBACK_CONFIRMATION) throw httpError(403, "rollback_confirmation_required", `Confirm ${ROLLBACK_CONFIRMATION} before restoring the previous homepage.`);
  const record = await loadRelease(request, releaseID);
  if (!record) throw httpError(404, "release_not_found", "The homepage release record expired or was not found.");
  if (!record.publication || !record.status.startsWith("published")) throw httpError(409, "release_not_published", "This homepage release is not eligible for rollback.");

  const current = await inspectThemeFiles(env, record.liveTheme.gid, record.files.map(file => file.filename));
  if (String(current.theme?.role || "").toUpperCase() !== "MAIN") throw httpError(409, "live_theme_changed", "The approved live theme changed after publication. Automatic rollback is blocked.");
  validatePublishedFiles(record, current.files);
  const recovery = await restoreLiveSnapshot(env, record);
  const liveProbe = await probeLive(env);
  const now = new Date().toISOString();
  record.status = liveProbe.ok ? "rolled-back-and-verified" : "rolled-back-needs-attention";
  record.updatedAt = now;
  record.rollback = {
    actor: String(body?.actor || "Executive").trim().slice(0, 120) || "Executive",
    approvedAt: now,
    confirmation,
    recovery,
    liveProbe,
  };
  await saveRelease(request, record);
  return record;
}

function normalizeApprovedFiles(value) {
  const files = (Array.isArray(value) ? value : [])
    .map(file => ({ filename: String(file?.filename || "").trim(), afterSha256: String(file?.afterSha256 || "").trim() }))
    .filter(file => file.filename && file.afterSha256);
  if (!files.length || files.length > 10) throw httpError(409, "approved_files_missing", "The visual review does not contain a bounded homepage file package.");
  if (new Set(files.map(file => file.filename)).size !== files.length) throw httpError(409, "approved_files_duplicate", "The approved homepage file package contains duplicate files.");
  if (!files.some(file => file.filename === "templates/index.json")) throw httpError(409, "homepage_template_missing", "The approved homepage package must include templates/index.json.");
  for (const file of files) {
    if (!isAllowedHomepageFile(file.filename)) throw httpError(409, "homepage_release_file_forbidden", `${file.filename} is outside the governed homepage release boundary.`);
  }
  return files;
}

function isAllowedHomepageFile(filename) {
  return filename === "templates/index.json"
    || /^sections\/[a-z0-9][a-z0-9_-]*\.liquid$/i.test(filename)
    || /^assets\/[a-z0-9][a-z0-9_.-]*\.(?:css|js|json)$/i.test(filename);
}

function validateThemeBoundary(stagingTheme, liveTheme) {
  if (!stagingTheme?.gid || String(stagingTheme.role || "").toUpperCase() === "MAIN") throw httpError(409, "verified_staging_required", "Kairos Staging must remain a verified non-live theme.");
  if (!liveTheme?.gid || String(liveTheme.role || "").toUpperCase() !== "MAIN") throw httpError(409, "verified_live_theme_required", "The live Shopify theme could not be verified.");
  if (stagingTheme.gid === liveTheme.gid) throw httpError(409, "theme_boundary_invalid", "Staging and live theme identities must remain separate.");
}

function validateBoundFiles(record, stagingFiles, liveFiles) {
  const staging = fileMap(stagingFiles);
  const live = fileMap(liveFiles);
  for (const file of record.files) {
    if (staging.get(file.filename)?.sha256 !== file.stagingSha256) throw httpError(409, "staging_source_changed", `${file.filename} changed on Kairos Staging after release preparation.`);
    if ((live.get(file.filename)?.sha256 || null) !== file.liveBeforeSha256) throw httpError(409, "live_source_changed", `${file.filename} changed on the live theme after release preparation.`);
  }
}

function validatePublishedFiles(record, files) {
  const current = fileMap(files);
  for (const file of record.files) {
    if (current.get(file.filename)?.sha256 !== file.stagingSha256) throw httpError(502, "live_readback_hash_mismatch", `The live Shopify read-back did not match the approved ${file.filename}.`);
  }
}

async function restoreLiveSnapshot(env, record) {
  const restoreFiles = record.files
    .filter(file => file.liveBeforeExisted)
    .map(file => ({ filename: file.filename, content: file.liveBeforeContent }));
  const deleteFiles = record.files.filter(file => !file.liveBeforeExisted).map(file => file.filename);
  const write = restoreFiles.length ? await writeThemeFiles(env, record.liveTheme.gid, restoreFiles) : null;
  const removal = deleteFiles.length ? await deleteThemeFiles(env, record.liveTheme.gid, deleteFiles) : null;
  const verified = await inspectThemeFiles(env, record.liveTheme.gid, record.files.map(file => file.filename));
  const current = fileMap(verified.files);
  for (const file of record.files) {
    const actual = current.get(file.filename)?.sha256 || null;
    if (actual !== file.liveBeforeSha256) throw httpError(502, "rollback_readback_mismatch", `The restored live ${file.filename} did not match its protected backup.`);
  }
  return {
    restored: true,
    filesRestored: restoreFiles.map(file => file.filename),
    filesDeleted: deleteFiles,
    credentialPath: write?.credentialPath || removal?.credentialPath || null,
  };
}

async function probeLive(env) {
  const origin = String(env.MMG_STOREFRONT_ORIGIN || `https://${String(env.SHOPIFY_STORE_DOMAIN || "").trim()}`).replace(/\/$/, "");
  if (!/^https:\/\//i.test(origin)) return { ok: false, status: 0, error: "Live storefront origin is unavailable." };
  const url = `${origin}/?kairos_release_verify=${encodeURIComponent(Date.now())}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Kairos-Homepage-Release/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    const type = response.headers.get("content-type") || "";
    const html = type.includes("text/html") ? await response.text() : "";
    return {
      ok: response.ok && html.length > 0,
      status: response.status,
      finalURL: response.url,
      contentType: type,
      bytes: html.length,
      latencyMs: Date.now() - started,
      title: decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim(),
    };
  } catch (error) {
    return { ok: false, status: 0, latencyMs: Date.now() - started, error: safeMessage(error) };
  }
}

function publicRecord(record) {
  return {
    ...record,
    files: record.files.map(({ stagingContent, liveBeforeContent, ...file }) => file),
  };
}

function fileMap(files) {
  return new Map((Array.isArray(files) ? files : []).map(file => [file.filename, file]));
}

function reviewRequest(request, reviewID) {
  return new Request(`${new URL(request.url).origin}/__kairos/visual-review/${reviewID}`);
}

function releaseRequest(request, releaseID) {
  return new Request(`${new URL(request.url).origin}/__kairos/homepage-release/${releaseID}`);
}

async function saveRelease(request, record) {
  await caches.default.put(releaseRequest(request, record.releaseID), new Response(JSON.stringify(record), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  }));
}

async function loadRelease(request, releaseID) {
  const response = await caches.default.match(releaseRequest(request, releaseID));
  if (!response) return null;
  try { return await response.json(); }
  catch { return null; }
}

function safeMessage(error) {
  return error instanceof Error && error.message ? error.message.slice(0, 1200) : "Kairos could not complete the homepage release.";
}

function decodeEntities(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function errorBody(code, message) {
  return { status: "failed", build: BUILD, error: { code, message } };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-MMG-Runtime": BUILD,
      "X-Kairos-Homepage-Release": BUILD,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
