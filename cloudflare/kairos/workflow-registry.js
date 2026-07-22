import { SHOPIFY_DOCTRINE_VERSION } from "./shopify-doctrine.js";

const WORKFLOWS = Object.freeze({
  "manuscript.write.v1": Object.freeze({
    domain: "publishing",
    description: "Assemble a manuscript artifact without Shopify access.",
    allowedOperations: Object.freeze(["artifact.manuscript.write"]),
    targetType: "manuscript",
    targetCount: 1,
    shopifyAccess: "none",
    writeApprovalRequired: false,
    allowedFields: Object.freeze(["title", "subtitle", "author", "chapters"]),
  }),
  "shopify.verify.connection.v1": Object.freeze({
    domain: "shopify",
    description: "Verify the installed Kairos app, store identity, and granted scopes.",
    allowedOperations: Object.freeze(["shopify.verifyInstallation"]),
    targetType: "shop",
    targetCount: 1,
    shopifyAccess: "read",
    writeApprovalRequired: false,
    allowedFields: Object.freeze([]),
  }),
  "shopify.product.update.v1": Object.freeze({
    domain: "shopify",
    description: "Update exactly one approved product and no other resource.",
    allowedOperations: Object.freeze(["shopify.product.update"]),
    targetType: "product",
    targetCount: 1,
    shopifyAccess: "write",
    writeApprovalRequired: true,
    allowedFields: Object.freeze([
      "id",
      "title",
      "descriptionHtml",
      "handle",
      "seo",
      "status",
      "tags",
      "templateSuffix",
      "vendor",
      "productType",
    ]),
  }),
  "shopify.page.update.v1": Object.freeze({
    domain: "shopify",
    description: "Update exactly one approved online-store page and no other resource.",
    allowedOperations: Object.freeze(["shopify.page.update"]),
    targetType: "page",
    targetCount: 1,
    shopifyAccess: "write",
    writeApprovalRequired: true,
    allowedFields: Object.freeze([
      "title",
      "body",
      "handle",
      "isPublished",
      "templateSuffix",
      "seo",
    ]),
  }),
  "shopify.menu.update.v1": Object.freeze({
    domain: "shopify",
    description: "Update exactly one approved navigation menu and no other resource.",
    allowedOperations: Object.freeze(["shopify.menu.update"]),
    targetType: "menu",
    targetCount: 1,
    shopifyAccess: "write",
    writeApprovalRequired: true,
    allowedFields: Object.freeze(["title", "handle", "items"]),
  }),
  "shopify.theme.unpublished-files.upsert.v1": Object.freeze({
    domain: "shopify",
    description: "Upsert approved files on exactly one unpublished theme.",
    allowedOperations: Object.freeze(["shopify.theme.unpublishedFiles.upsert"]),
    targetType: "theme",
    targetCount: 1,
    shopifyAccess: "write",
    writeApprovalRequired: true,
    allowedFields: Object.freeze(["files"]),
    exactFilePathsRequired: true,
  }),
});

export function getWorkflow(workflowId) {
  return WORKFLOWS[workflowId] || null;
}

export function listWorkflows() {
  return Object.entries(WORKFLOWS).map(([id, workflow]) => ({ id, ...workflow }));
}

export function createOperationManifest(input, now = new Date()) {
  const workflowId = requireString(input?.workflowId, "workflowId");
  const workflow = getWorkflow(workflowId);
  if (!workflow) throw new WorkflowError("UNKNOWN_WORKFLOW", `Unknown workflow: ${workflowId}`);

  const targetIds = normalizeUniqueStrings(input?.targetIds);
  if (targetIds.length !== workflow.targetCount) {
    throw new WorkflowError(
      "INVALID_TARGET_COUNT",
      `${workflowId} requires exactly ${workflow.targetCount} target identifier(s).`,
    );
  }
  if (targetIds.some(isWildcard)) {
    throw new WorkflowError("WILDCARD_TARGET_DENIED", "Wildcard target identifiers are prohibited.");
  }

  const allowedFilePaths = normalizeUniqueStrings(input?.allowedFilePaths);
  if (workflow.exactFilePathsRequired && allowedFilePaths.length === 0) {
    throw new WorkflowError("FILE_SCOPE_REQUIRED", "Exact theme file paths are required.");
  }
  if (allowedFilePaths.some(isWildcard)) {
    throw new WorkflowError("WILDCARD_FILE_DENIED", "Wildcard file paths are prohibited.");
  }

  const requestedFields = normalizeUniqueStrings(input?.allowedFields);
  const allowedFields = requestedFields.length ? requestedFields : [...workflow.allowedFields];
  const invalidFields = allowedFields.filter((field) => !workflow.allowedFields.includes(field));
  if (invalidFields.length) {
    throw new WorkflowError(
      "FIELD_SCOPE_DENIED",
      `Fields outside the workflow contract: ${invalidFields.join(", ")}`,
    );
  }

  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const approvalRef = optionalString(input?.approvalRef);
  const approvedAt = optionalString(input?.approvedAt);

  if (workflow.writeApprovalRequired && (!approvalRef || !approvedAt)) {
    throw new WorkflowError(
      "EXPLICIT_APPROVAL_REQUIRED",
      "A write manifest requires an explicit approval reference and approval timestamp.",
    );
  }

  return Object.freeze({
    manifestVersion: "1.0",
    doctrineVersion: SHOPIFY_DOCTRINE_VERSION,
    manifestId: crypto.randomUUID(),
    workflowId,
    domain: workflow.domain,
    targetType: workflow.targetType,
    targetIds: Object.freeze(targetIds),
    allowedOperations: workflow.allowedOperations,
    allowedFields: Object.freeze(allowedFields),
    allowedFilePaths: Object.freeze(allowedFilePaths),
    shopifyAccess: workflow.shopifyAccess,
    writeApprovalRequired: workflow.writeApprovalRequired,
    approvalRef,
    approvedAt,
    createdAt,
    expiresAt,
  });
}

function normalizeUniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function optionalString(value) {
  if (value == null || value === "") return null;
  return String(value).trim() || null;
}

function requireString(value, name) {
  const normalized = optionalString(value);
  if (!normalized) throw new WorkflowError("INVALID_INPUT", `${name} is required.`);
  return normalized;
}

function isWildcard(value) {
  return value.includes("*") || value.includes("?");
}

export class WorkflowError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
    this.status = 400;
  }
}
