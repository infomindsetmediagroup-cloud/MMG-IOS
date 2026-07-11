import { json, readJson, requireEnv, requireSession, runtimeError, sha256 } from "./runtime-core.js";
import { getMainTheme, readAsset, shopifyFetch } from "./shopify-read.js";

const ALLOWED_KEY = /^(assets|config|layout|locales|sections|snippets|templates)\/[A-Za-z0-9_./-]+\.(css|js|json|liquid|svg|txt)$/;

export async function handleActions(request, env) {
  if (request.method !== "POST") return json({ error: { code: "method_not_allowed", message: "Use POST." } }, 405);
  const session = await requireSession(request, env);
  requireEnv(env, ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN"]);
  const body = await readJson(request);

  if (["storefront.audit", "shopify.homepage.audit"].includes(body.actionType)) {
    const response = await fetch("https://themindsetmediagroup.com", { headers: { "User-Agent": "MMG-Kairos/1.0" } });
    return json({ actionID: crypto.randomUUID(), actionType: body.actionType, status: response.ok ? "completed" : "failed", completedAt: new Date().toISOString(), evidence: { url: response.url, status: response.status, verified: response.ok }, executionContext: { authorizationMode: "session", operator: session.operator, sessionId: session.sessionId } }, response.ok ? 200 : 502);
  }

  if (body.actionType !== "shopify.theme.files.upsert") throw runtimeError(400, "unsupported_action", "This Cloudflare execution adapter does not support the requested action.");
  if (!body.approval || body.approval.approved !== true) throw runtimeError(409, "approval_required", "Approve this mutation before execution.");

  const mutation = body.mutation || body.proposal?.mutationPlan;
  if (!mutation || !/^\d+$/.test(String(mutation.themeId || "")) || !Array.isArray(mutation.files) || mutation.files.length < 1 || mutation.files.length > 10) throw runtimeError(400, "mutation_plan_required", "The approved proposal must include an exact Shopify mutation plan.");

  const theme = await getMainTheme(env);
  if (String(theme.id) !== String(mutation.themeId)) throw runtimeError(409, "main_theme_mismatch", "The approved theme is no longer current. Regenerate the proposal.");

  const backups = [];
  const completed = [];
  try {
    for (const file of mutation.files) {
      if (!ALLOWED_KEY.test(file.key) || file.key.includes("..")) throw runtimeError(400, "unsafe_theme_path", `Theme path is not allowed: ${file.key}`);
      if (typeof file.value !== "string" || new TextEncoder().encode(file.value).length > 500000) throw runtimeError(413, "theme_file_too_large", `${file.key} exceeds the mutation size limit.`);
      const before = await readAsset(env, mutation.themeId, file.key);
      backups.push(before);
      if (file.expectedSha256 && before.sha256 !== file.expectedSha256) throw runtimeError(409, "theme_file_changed", `${file.key} changed after approval. Regenerate the proposal.`);
      await writeAsset(env, mutation.themeId, file.key, file.value);
      const after = await readAsset(env, mutation.themeId, file.key);
      const expected = await sha256(file.value);
      if (!after.existed || after.sha256 !== expected) throw runtimeError(502, "theme_verification_failed", `Shopify did not verify ${file.key}.`);
      completed.push({ key: file.key, beforeSha256: before.sha256, afterSha256: expected, verified: true });
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const backup of [...backups].reverse()) {
      try { backup.existed ? await writeAsset(env, mutation.themeId, backup.key, backup.value) : await deleteAsset(env, mutation.themeId, backup.key); }
      catch (rollbackError) { rollbackErrors.push(`${backup.key}: ${rollbackError.message}`); }
    }
    if (rollbackErrors.length) throw runtimeError(500, "mutation_failed_rollback_incomplete", `Mutation failed and rollback was incomplete: ${rollbackErrors.join("; ")}`);
    throw error;
  }

  return json({ actionID: crypto.randomUUID(), actionType: "shopify.theme.files.upsert", status: "completed", completedAt: new Date().toISOString(), evidence: { themeId: String(mutation.themeId), files: completed, backup: backups.map(item => ({ key: item.key, existed: item.existed, sha256: item.sha256 })), rollbackAvailable: true, rollbackPerformed: false, externalMutation: true, verified: true }, executionContext: { authorizationMode: "session", operator: session.operator, sessionId: session.sessionId } });
}

async function writeAsset(env, themeId, key, value) {
  const response = await shopifyFetch(env, `/themes/${themeId}/assets.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset: { key, value } }) });
  if (!response.ok) throw runtimeError(502, "theme_asset_write_failed", `Shopify could not update ${key}.`);
}

async function deleteAsset(env, themeId, key) {
  const response = await shopifyFetch(env, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw runtimeError(502, "theme_asset_delete_failed", `Shopify could not remove ${key} during rollback.`);
}
