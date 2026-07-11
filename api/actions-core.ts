import { randomUUID } from "node:crypto";
import { KairosHttpError } from "./kairos-core.js";

export const SHOPIFY_HOMEPAGE_AUDIT = "shopify.homepage.audit" as const;
export const DEFAULT_SHOPIFY_API_VERSION = "2026-07";

export interface ActionEnvironment {
  SHOPIFY_STORE_DOMAIN?: string;
  SHOPIFY_ADMIN_ACCESS_TOKEN?: string;
  SHOPIFY_API_VERSION?: string;
}

export interface ApprovedActionRequest {
  actionType: typeof SHOPIFY_HOMEPAGE_AUDIT;
  objective: string;
  approval: {
    approved: true;
    actor: string;
    approvedAt: string;
  };
}

export interface ShopifyConfiguration {
  storeDomain: string;
  accessToken: string;
  apiVersion: string;
}

export interface ShopifyThemeEvidence {
  themeID: string;
  name: string;
  role: string;
  updatedAt: string;
  processing: boolean;
  processingFailed: boolean;
  homepageFiles: string[];
}

export interface ActionExecutionResponse {
  actionID: string;
  actionType: typeof SHOPIFY_HOMEPAGE_AUDIT;
  status: "completed";
  startedAt: string;
  completedAt: string;
  evidence: ShopifyThemeEvidence;
}

export function parseApprovedActionRequest(value: unknown): ApprovedActionRequest {
  if (!isRecord(value)) {
    throw new KairosHttpError(400, "invalid_action", "Action body must be a JSON object.");
  }
  if (value.actionType !== SHOPIFY_HOMEPAGE_AUDIT) {
    throw new KairosHttpError(400, "unsupported_action", "This execution adapter does not support the requested action.");
  }

  const objective = boundedText(value.objective, "objective", 8_000);
  if (!isRecord(value.approval) || value.approval.approved !== true) {
    throw new KairosHttpError(409, "approval_required", "Approve this action before execution.");
  }

  const actor = boundedText(value.approval.actor, "approval.actor", 160);
  const approvedAt = boundedText(value.approval.approvedAt, "approval.approvedAt", 80);
  if (Number.isNaN(Date.parse(approvedAt))) {
    throw new KairosHttpError(400, "invalid_approval", "approval.approvedAt must be an ISO-8601 timestamp.");
  }

  return {
    actionType: SHOPIFY_HOMEPAGE_AUDIT,
    objective,
    approval: { approved: true, actor, approvedAt },
  };
}

export function requireShopifyConfiguration(environment: ActionEnvironment): ShopifyConfiguration {
  const storeDomain = environment.SHOPIFY_STORE_DOMAIN?.trim().toLowerCase();
  const accessToken = environment.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  const apiVersion = environment.SHOPIFY_API_VERSION?.trim() || DEFAULT_SHOPIFY_API_VERSION;

  if (!storeDomain || !accessToken) {
    throw new KairosHttpError(503, "shopify_not_configured", "The Shopify execution adapter is not configured.");
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(storeDomain)) {
    throw new KairosHttpError(503, "shopify_invalid_domain", "The Shopify store domain is invalid.");
  }
  if (!/^\d{4}-\d{2}$/.test(apiVersion)) {
    throw new KairosHttpError(503, "shopify_invalid_version", "The Shopify API version is invalid.");
  }

  return { storeDomain, accessToken, apiVersion };
}

export function shopifyGraphQLEndpoint(configuration: ShopifyConfiguration): string {
  return `https://${configuration.storeDomain}/admin/api/${configuration.apiVersion}/graphql.json`;
}

export function buildHomepageAuditQuery(): { query: string; variables: Record<string, never> } {
  return {
    query: `query KairosHomepageAudit {
      themes(first: 1, roles: [MAIN]) {
        nodes {
          id
          name
          role
          updatedAt
          processing
          processingFailed
          files(first: 50, filenames: ["templates/index.json", "templates/index.liquid", "layout/theme.liquid", "config/settings_data.json"]) {
            nodes { filename }
          }
        }
      }
    }`,
    variables: {},
  };
}

export function parseHomepageAuditEvidence(value: unknown): ShopifyThemeEvidence {
  if (!isRecord(value)) throw shopifyResponseError();
  if (Array.isArray(value.errors) && value.errors.length > 0) {
    throw new KairosHttpError(502, "shopify_graphql_error", "Shopify rejected the homepage audit query.");
  }

  const data = recordValue(value.data);
  const themes = recordValue(data.themes);
  const nodes = Array.isArray(themes.nodes) ? themes.nodes : [];
  const theme = recordValue(nodes[0]);
  const files = recordValue(theme.files);
  const fileNodes = Array.isArray(files.nodes) ? files.nodes : [];

  return {
    themeID: responseText(theme.id, 256),
    name: responseText(theme.name, 256),
    role: responseText(theme.role, 64),
    updatedAt: responseText(theme.updatedAt, 80),
    processing: Boolean(theme.processing),
    processingFailed: Boolean(theme.processingFailed),
    homepageFiles: fileNodes
      .map((item) => recordValue(item).filename)
      .filter((filename): filename is string => typeof filename === "string" && filename.length > 0),
  };
}

function responseText(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw shopifyResponseError();
  }
  return value.trim();
}

export function buildCompletedAction(evidence: ShopifyThemeEvidence, startedAt: Date, now: Date = new Date()): ActionExecutionResponse {
  return {
    actionID: randomUUID(),
    actionType: SHOPIFY_HOMEPAGE_AUDIT,
    status: "completed",
    startedAt: startedAt.toISOString(),
    completedAt: now.toISOString(),
    evidence,
  };
}

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") {
    throw new KairosHttpError(400, "invalid_action", `${field} must be text.`);
  }
  const text = value.trim();
  if (!text || text.length > maximum) {
    throw new KairosHttpError(400, "invalid_action", `${field} is empty or exceeds its limit.`);
  }
  return text;
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw shopifyResponseError();
  return value;
}

function shopifyResponseError(): KairosHttpError {
  return new KairosHttpError(502, "shopify_invalid_response", "Shopify returned an invalid homepage audit response.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
