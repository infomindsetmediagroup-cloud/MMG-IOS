import { SHOPIFY_DOCTRINE_VERSION } from "./shopify-doctrine.js";

const CONTRACTS = Object.freeze({
  "artifact.manuscript.write": Object.freeze({
    access: "local",
    target: (args) => args?.manuscriptId,
    fieldContainer: (args) => args?.manuscript,
  }),
  "shopify.verifyInstallation": Object.freeze({
    access: "read",
    target: (_args, manifest) => manifest.targetIds[0],
    fieldContainer: () => ({}),
  }),
  "shopify.product.update": Object.freeze({
    access: "write",
    target: (args) => args?.product?.id,
    fieldContainer: (args) => args?.product,
  }),
  "shopify.page.update": Object.freeze({
    access: "write",
    target: (args) => args?.id,
    fieldContainer: (args) => args?.page,
  }),
  "shopify.menu.update": Object.freeze({
    access: "write",
    target: (args) => args?.id,
    fieldContainer: (args) => ({
      title: args?.title,
      handle: args?.handle,
      items: args?.items,
    }),
  }),
  "shopify.theme.unpublishedFiles.upsert": Object.freeze({
    access: "write",
    target: (args) => args?.themeId,
    fieldContainer: (args) => ({ files: args?.files }),
  }),
});

export function authorizeOperation({ manifest, operationName, args, env, idempotencyKey, now = new Date() }) {
  validateManifest(manifest, now);

  const contract = CONTRACTS[operationName];
  if (!contract) deny("UNREGISTERED_OPERATION", `Operation is not registered: ${operationName}`);
  if (!manifest.allowedOperations.includes(operationName)) {
    deny("OPERATION_OUT_OF_SCOPE", `${operationName} is not authorized by this task manifest.`);
  }

  if (manifest.workflowId === "manuscript.write.v1" && operationName.startsWith("shopify.")) {
    deny("CROSS_DOMAIN_OPERATION_DENIED", "Manuscript workflows cannot access Shopify.");
  }

  const targetId = normalizeTarget(contract.target(args, manifest));
  if (!targetId || !manifest.targetIds.includes(targetId)) {
    deny("TARGET_OUT_OF_SCOPE", "The operation target does not exactly match the approved target.");
  }

  const suppliedFields = Object.entries(contract.fieldContainer(args) || {})
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field);
  const deniedFields = suppliedFields.filter((field) => !manifest.allowedFields.includes(field));
  if (deniedFields.length) {
    deny("FIELD_OUT_OF_SCOPE", `Unauthorized fields: ${deniedFields.join(", ")}`);
  }

  if (operationName === "shopify.theme.unpublishedFiles.upsert") {
    validateThemeFiles(args?.files, manifest.allowedFilePaths);
  }

  if (contract.access === "write") {
    if (String(env?.KAIROS_SHOPIFY_WRITES_ENABLED || "").toLowerCase() !== "true") {
      deny("SHOPIFY_WRITES_DISABLED", "Shopify writes are globally disabled in the Cloudflare runtime.", 503);
    }
    if (!manifest.approvalRef || !manifest.approvedAt) {
      deny("EXPLICIT_APPROVAL_REQUIRED", "The operation has no explicit approval record.");
    }
    if (!isNonEmptyString(idempotencyKey)) {
      deny("IDEMPOTENCY_KEY_REQUIRED", "Every Shopify write requires an idempotency key.");
    }
  }

  return Object.freeze({
    operationName,
    targetId,
    access: contract.access,
    idempotencyKey: idempotencyKey || null,
    manifestId: manifest.manifestId,
    workflowId: manifest.workflowId,
    approvalRef: manifest.approvalRef,
  });
}

function validateManifest(manifest, now) {
  if (!manifest || typeof manifest !== "object") deny("MANIFEST_REQUIRED", "An operation manifest is required.");
  if (manifest.doctrineVersion !== SHOPIFY_DOCTRINE_VERSION) {
    deny("DOCTRINE_VERSION_MISMATCH", "The manifest was created under a different Shopify doctrine version.");
  }
  if (!isNonEmptyString(manifest.manifestId) || !isNonEmptyString(manifest.workflowId)) {
    deny("INVALID_MANIFEST", "The manifest identity is invalid.");
  }
  if (!Array.isArray(manifest.allowedOperations) || !Array.isArray(manifest.targetIds)) {
    deny("INVALID_MANIFEST", "The manifest scope is invalid.");
  }
  if (manifest.targetIds.some((value) => String(value).includes("*") || String(value).includes("?"))) {
    deny("WILDCARD_TARGET_DENIED", "Wildcard targets are prohibited.");
  }
  const expiration = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(expiration) || expiration <= now.getTime()) {
    deny("MANIFEST_EXPIRED", "The operation manifest has expired.", 401);
  }
}

function validateThemeFiles(files, allowedFilePaths) {
  if (!Array.isArray(files) || files.length === 0) {
    deny("THEME_FILES_REQUIRED", "At least one theme file is required.");
  }
  const paths = files.map((file) => String(file?.filename || "").trim());
  if (paths.some((path) => !path)) deny("INVALID_THEME_FILE", "Every theme file requires a filename.");
  const outOfScope = paths.filter((path) => !allowedFilePaths.includes(path));
  if (outOfScope.length) {
    deny("THEME_FILE_OUT_OF_SCOPE", `Unauthorized theme file paths: ${outOfScope.join(", ")}`);
  }
  if (new Set(paths).size !== paths.length) {
    deny("DUPLICATE_THEME_FILE", "Duplicate theme file paths are prohibited.");
  }
}

function normalizeTarget(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function deny(code, message, status = 403) {
  throw new ScopeViolation(code, message, status);
}

export class ScopeViolation extends Error {
  constructor(code, message, status = 403) {
    super(message);
    this.name = "ScopeViolation";
    this.code = code;
    this.status = status;
  }
}
