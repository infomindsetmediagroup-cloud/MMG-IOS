import { z } from "zod";

export const WORKFLOW_STATUSES = [
  "created",
  "running",
  "waiting_for_approval",
  "blocked_provider",
  "failed_retriable",
  "failed_terminal",
  "completed",
  "cancelled",
] as const;

export const KAIROS_ERROR_CODES = [
  "PROVIDER_QUOTA_EXHAUSTED",
  "PROVIDER_AUTH_INVALID",
  "PROVIDER_PERMISSION_DENIED",
  "PROVIDER_UNAVAILABLE",
  "SOURCE_INVALID",
  "SOURCE_UNAVAILABLE",
  "APPROVAL_REQUIRED",
  "APPROVAL_REJECTED",
  "ARTIFACT_VALIDATION_FAILED",
  "SHOPIFY_DRAFT_FAILED",
  "PUBLICATION_VERIFICATION_FAILED",
  "INTERNAL_CONTRACT_VIOLATION",
] as const;

export const PROVIDER_STATUSES = ["ready", "degraded", "blocked", "disabled", "unknown"] as const;

export const WorkflowStatusSchema = z.enum(WORKFLOW_STATUSES);
export const KairosErrorCodeSchema = z.enum(KAIROS_ERROR_CODES);
export const ProviderStatusSchema = z.enum(PROVIDER_STATUSES);

export const KairosErrorSchema = z.object({
  code: KairosErrorCodeSchema,
  message: z.string().min(1),
  retriable: z.boolean(),
  stage: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ProviderHealthSchema = z.object({
  provider: z.string().min(1),
  status: ProviderStatusSchema,
  model: z.string().min(1).nullable(),
  reason: KairosErrorCodeSchema.nullable(),
  checkedAt: z.string().datetime(),
});

export const RuntimeHealthSchema = z.object({
  application: z.literal("ready"),
  storage: z.enum(["ready", "degraded", "unavailable"]),
  workflow: z.enum(["ready", "degraded", "unavailable"]),
  provider: ProviderHealthSchema,
  release: z.object({
    build: z.string().min(1),
    contractVersion: z.literal("1.0.0"),
    deployedAt: z.string().datetime().nullable(),
  }),
  boundaries: z.object({
    shopifyDraftApprovalRequired: z.literal(true),
    livePublicationApprovalRequired: z.literal(true),
    directWebsiteMutationAuthorized: z.literal(false),
    browserInferenceRequired: z.literal(false),
  }),
});

export const WorkflowStepReceiptSchema = z.object({
  stepId: z.string().min(1),
  workflowVersion: z.string().min(1),
  inputSchemaVersion: z.string().min(1),
  status: WorkflowStatusSchema,
  attempt: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  inputReferences: z.array(z.string()),
  outputReferences: z.array(z.string()),
  error: KairosErrorSchema.nullable(),
  approvalReceipt: z.string().nullable(),
});

export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type KairosErrorCode = z.infer<typeof KairosErrorCodeSchema>;
export type KairosError = z.infer<typeof KairosErrorSchema>;
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;
export type RuntimeHealth = z.infer<typeof RuntimeHealthSchema>;
export type WorkflowStepReceipt = z.infer<typeof WorkflowStepReceiptSchema>;

export function classifyProviderFailure(status: number, code?: string | null): KairosErrorCode {
  if (status === 429 && code === "insufficient_quota") return "PROVIDER_QUOTA_EXHAUSTED";
  if (status === 401) return "PROVIDER_AUTH_INVALID";
  if (status === 403) return "PROVIDER_PERMISSION_DENIED";
  return "PROVIDER_UNAVAILABLE";
}
