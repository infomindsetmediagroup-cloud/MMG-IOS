import { createHash, randomUUID } from "node:crypto";
import { KairosHttpError } from "./kairos-core.js";
import type { ShopifyConfiguration } from "./actions-core.js";

export const SHOPIFY_THEME_FILES_UPSERT = "shopify.theme.files.upsert" as const;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 500_000;
const MAX_TOTAL_BYTES = 1_500_000;
const ALLOWED_KEY = /^(assets|config|layout|locales|sections|snippets|templates)\/[A-Za-z0-9_./-]+\.(css|js|json|liquid|svg|txt)$/;

export interface ThemeMutationFile {
  key: string;
  value: string;
  expectedSha256?: string;
}

export interface ThemeMutationRequest {
  actionType: typeof SHOPIFY_THEME_FILES_UPSERT;
  objective: string;
  approval: { approved: true; actor: string; approvedAt: string };
  mutation: {
    themeId: string;
    files: ThemeMutationFile[];
  };
}

export interface ThemeAssetSnapshot {
  key: string;
  existed: boolean;
  value?: string;
  sha256?: string;
}

export interface ThemeMutationEvidence {
  actionID: string;
  actionType: typeof SHOPIFY_THEME_FILES_UPSERT;
  status: "completed";
  startedAt: string;
  completedAt: string;
  evidence: {
    themeId: string;
    files: Array<{ key: string; beforeSha256?: string; afterSha256: string; verified: true }>;
    backup: Array<{ key: string; existed: boolean; sha256?: string }>;
    rollbackAvailable: true;
    rollbackPerformed: false;
  };
}

export function parseThemeMutationRequest(value: unknown): ThemeMutationRequest {
  if (!isRecord(value) || value.actionType !== SHOPIFY_THEME_FILES_UPSERT) {
    throw new KairosHttpError(400, "unsupported_action", "This execution adapter does not support the requested action.");
  }
  const objective = boundedText(value.objective, "objective", 8_000);
  if (!isRecord(value.approval) || value.approval.approved !== true) {
    throw new KairosHttpError(409, "approval_required", "Approve this mutation before execution.");
  }
  const actor = boundedText(value.approval.actor, "approval.actor", 160);
  const approvedAt = boundedText(value.approval.approvedAt, "approval.approvedAt", 80);
  if (Number.isNaN(Date.parse(approvedAt))) throw new KairosHttpError(400, "invalid_approval", "approval.approvedAt must be an ISO-8601 timestamp.");
  if (!isRecord(value.mutation)) throw new KairosHttpError(400, "mutation_plan_required", "The approved proposal must include an exact Shopify mutation plan.");
  const themeId = boundedText(value.mutation.themeId, "mutation.themeId", 64);
  if (!/^\d+$/.test(themeId)) throw new KairosHttpError(400, "invalid_theme_id", "mutation.themeId must be a numeric Shopify theme ID.");
  if (!Array.isArray(value.mutation.files) || value.mutation.files.length < 1 || value.mutation.files.length > MAX_FILES) {
    throw new KairosHttpError(400, "invalid_mutation_files", `mutation.files must contain between 1 and ${MAX_FILES} files.`);
  }
  let totalBytes = 0;
  const files = value.mutation.files.map((entry, index) => {
    if (!isRecord(entry)) throw new KairosHttpError(400, "invalid_mutation_file", `mutation.files[${index}] must be an object.`);
    const key = boundedText(entry.key, `mutation.files[${index}].key`, 240);
    if (!ALLOWED_KEY.test(key) || key.includes("..")) throw new KairosHttpError(400, "unsafe_theme_path", `Theme file path is not allowed: ${key}`);
    const fileValue = boundedText(entry.value, `mutation.files[${index}].value`, MAX_FILE_BYTES, true);
    const bytes = Buffer.byteLength(fileValue, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new KairosHttpError(413, "theme_file_too_large", `${key} exceeds the mutation size limit.`);
    totalBytes += bytes;
    const expectedSha256 = typeof entry.expectedSha256 === "string" && /^[a-f0-9]{64}$/i.test(entry.expectedSha256) ? entry.expectedSha256.toLowerCase() : undefined;
    return { key, value: fileValue, expectedSha256 };
  });
  if (new Set(files.map(file => file.key)).size !== files.length) throw new KairosHttpError(400, "duplicate_theme_path", "Each theme file may appear only once in a mutation.");
  if (totalBytes > MAX_TOTAL_BYTES) throw new KairosHttpError(413, "mutation_too_large", "The approved theme mutation exceeds the total size limit.");
  return { actionType: SHOPIFY_THEME_FILES_UPSERT, objective, approval: { approved: true, actor, approvedAt }, mutation: { themeId, files } };
}

export async function executeThemeMutation(request: ThemeMutationRequest, configuration: ShopifyConfiguration, signal?: AbortSignal): Promise<ThemeMutationEvidence> {
  const startedAt = new Date();
  await assertMainTheme(configuration, request.mutation.themeId, signal);
  const backups: ThemeAssetSnapshot[] = [];
  const completed: Array<{ key: string; beforeSha256?: string; afterSha256: string; verified: true }> = [];
  try {
    for (const file of request.mutation.files) {
      const before = await readAsset(configuration, request.mutation.themeId, file.key, signal);
      backups.push(before);
      if (file.expectedSha256 && before.sha256 !== file.expectedSha256) {
        throw new KairosHttpError(409, "theme_file_changed", `${file.key} changed after the proposal was prepared. Regenerate and reapprove the mutation plan.`);
      }
      await writeAsset(configuration, request.mutation.themeId, file.key, file.value, signal);
      const verified = await readAsset(configuration, request.mutation.themeId, file.key, signal);
      const afterSha256 = sha256(file.value);
      if (!verified.existed || verified.sha256 !== afterSha256) throw new KairosHttpError(502, "theme_verification_failed", `Shopify did not verify the expected content for ${file.key}.`);
      completed.push({ key: file.key, beforeSha256: before.sha256, afterSha256, verified: true });
    }
  } catch (error) {
    const rollbackErrors = await rollback(configuration, request.mutation.themeId, backups, AbortSignal.timeout(15_000));
    if (rollbackErrors.length) throw new KairosHttpError(500, "mutation_failed_rollback_incomplete", `Theme mutation failed and rollback was incomplete: ${rollbackErrors.join("; ")}`);
    if (error instanceof KairosHttpError) throw error;
    throw new KairosHttpError(500, "theme_mutation_failed", "The approved Shopify mutation failed and the previous theme state was restored.");
  }
  return {
    actionID: randomUUID(),
    actionType: SHOPIFY_THEME_FILES_UPSERT,
    status: "completed",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    evidence: {
      themeId: request.mutation.themeId,
      files: completed,
      backup: backups.map(({ key, existed, sha256: hash }) => ({ key, existed, sha256: hash })),
      rollbackAvailable: true,
      rollbackPerformed: false,
    },
  };
}

async function assertMainTheme(configuration: ShopifyConfiguration, themeId: string, signal?: AbortSignal): Promise<void> {
  const response = await shopifyFetch(configuration, "/themes.json?role=main", { method: "GET", signal });
  const body = await readJSON(response);
  const themes = isRecord(body) && Array.isArray(body.themes) ? body.themes : [];
  const main = themes.find(theme => isRecord(theme) && String(theme.id) === themeId && theme.role === "main");
  if (!main) throw new KairosHttpError(409, "main_theme_mismatch", "The approved theme ID is not the current published Shopify theme. Regenerate the proposal before mutating production.");
}

async function readAsset(configuration: ShopifyConfiguration, themeId: string, key: string, signal?: AbortSignal): Promise<ThemeAssetSnapshot> {
  const response = await shopifyFetch(configuration, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { method: "GET", signal });
  if (response.status === 404) return { key, existed: false };
  const body = await readJSON(response);
  if (!response.ok) throw shopifyError(response.status, "theme_asset_read_failed", `Shopify could not read ${key}.`);
  const asset = isRecord(body) && isRecord(body.asset) ? body.asset : null;
  const value = asset && typeof asset.value === "string" ? asset.value : undefined;
  if (value === undefined) throw new KairosHttpError(409, "binary_asset_unsupported", `Only text theme assets can be mutated safely: ${key}`);
  return { key, existed: true, value, sha256: sha256(value) };
}

async function writeAsset(configuration: ShopifyConfiguration, themeId: string, key: string, value: string, signal?: AbortSignal): Promise<void> {
  const response = await shopifyFetch(configuration, `/themes/${themeId}/assets.json`, {
    method: "PUT",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset: { key, value } }),
  });
  if (!response.ok) throw shopifyError(response.status, "theme_asset_write_failed", `Shopify could not update ${key}.`);
}

async function deleteAsset(configuration: ShopifyConfiguration, themeId: string, key: string, signal?: AbortSignal): Promise<void> {
  const response = await shopifyFetch(configuration, `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`, { method: "DELETE", signal });
  if (!response.ok && response.status !== 404) throw shopifyError(response.status, "theme_asset_delete_failed", `Shopify could not remove ${key} during rollback.`);
}

async function rollback(configuration: ShopifyConfiguration, themeId: string, backups: ThemeAssetSnapshot[], signal?: AbortSignal): Promise<string[]> {
  const errors: string[] = [];
  for (const backup of [...backups].reverse()) {
    try {
      if (backup.existed && backup.value !== undefined) await writeAsset(configuration, themeId, backup.key, backup.value, signal);
      else await deleteAsset(configuration, themeId, backup.key, signal);
    } catch (error) {
      errors.push(error instanceof Error ? `${backup.key}: ${error.message}` : `${backup.key}: rollback failed`);
    }
  }
  return errors;
}

function shopifyFetch(configuration: ShopifyConfiguration, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-Shopify-Access-Token", configuration.accessToken);
  headers.set("Accept", "application/json");
  return fetch(`https://${configuration.storeDomain}/admin/api/${configuration.apiVersion}${path}`, { ...init, headers });
}

function shopifyError(status: number, code: string, message: string): KairosHttpError {
  return new KairosHttpError(status === 429 ? 429 : 502, code, message);
}

async function readJSON(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as unknown; } catch { return {}; }
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function boundedText(value: unknown, field: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new KairosHttpError(400, "invalid_action", `${field} must be text.`);
  const text = value.trim();
  if ((!allowEmpty && !text) || value.length > maximum) throw new KairosHttpError(400, "invalid_action", `${field} is empty or exceeds its limit.`);
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
