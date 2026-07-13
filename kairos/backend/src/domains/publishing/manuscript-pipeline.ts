import type { PlatformIdentityContext } from '../../platform/contracts.js';
import type { PublishingProject } from './contracts.js';

export type ManuscriptPipelineStage =
  | 'uploaded'
  | 'validated'
  | 'text_extracted'
  | 'editorial_analysis'
  | 'revision_proposed'
  | 'customer_review'
  | 'revision_approved'
  | 'kdp_readiness_review'
  | 'ready_for_export'
  | 'blocked';

export interface ManuscriptUpload {
  tenantId: string;
  publishingProjectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  sourceAssetId: string;
}

export interface EditorialIssue {
  id: string;
  category: 'spelling' | 'grammar' | 'punctuation' | 'consistency' | 'structure' | 'front_matter' | 'back_matter' | 'formatting' | 'image' | 'metadata' | 'kdp_readiness';
  severity: 'info' | 'warning' | 'blocking';
  message: string;
  recommendation: string;
  location?: string;
  evidence?: string;
}

export interface KdpReadinessProfile {
  edition: 'paperback' | 'hardcover' | 'ebook';
  language: string;
  bleed: boolean;
  trimWidthInches?: number;
  trimHeightInches?: number;
  requireTableOfContents: boolean;
  requireEmbeddedFonts: boolean;
  minimumImageDpi: number;
  sourceRevision: string;
  sourceUrl?: string;
  reviewedAt: string;
}

export interface RevisionProposal {
  id: string;
  sourceAssetId: string;
  proposedAssetId: string;
  summary: string;
  issueIds: string[];
  createdAt: string;
  createdBy: string;
  decision: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  decidedAt?: string;
}

export interface KdpReadinessReport {
  id: string;
  checkedAt: string;
  profile: KdpReadinessProfile;
  status: 'ready' | 'ready_with_warnings' | 'blocked';
  issues: EditorialIssue[];
  disclaimer: string;
}

export interface ManuscriptPipelineRecord {
  id: string;
  tenantId: string;
  publishingProjectId: string;
  sourceAssetId: string;
  currentAssetId: string;
  stage: ManuscriptPipelineStage;
  revision: number;
  createdAt: string;
  updatedAt: string;
  issues: EditorialIssue[];
  proposal?: RevisionProposal;
  readinessReport?: KdpReadinessReport;
  blockedReason?: string;
}

const allowedMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain',
  'application/rtf',
  'text/rtf',
  'application/vnd.oasis.opendocument.text'
]);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const transitions: Record<ManuscriptPipelineStage, ManuscriptPipelineStage[]> = {
  uploaded: ['validated', 'blocked'],
  validated: ['text_extracted', 'blocked'],
  text_extracted: ['editorial_analysis', 'blocked'],
  editorial_analysis: ['revision_proposed', 'blocked'],
  revision_proposed: ['customer_review', 'blocked'],
  customer_review: ['revision_approved', 'revision_proposed', 'blocked'],
  revision_approved: ['kdp_readiness_review', 'blocked'],
  kdp_readiness_review: ['ready_for_export', 'revision_proposed', 'blocked'],
  ready_for_export: [],
  blocked: ['uploaded', 'validated']
};

function fail(message: string, code: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { code, statusCode });
}

function assertTenant(tenantId: string, identity: PlatformIdentityContext): void {
  if (tenantId !== identity.tenantId) fail('Tenant does not match the execution context.', 'cross_tenant_access', 403);
}

export function validateManuscriptUpload(upload: ManuscriptUpload): void {
  if (!allowedMimeTypes.has(upload.mimeType)) fail('Unsupported manuscript file type.', 'unsupported_manuscript_type', 415);
  if (upload.sizeBytes <= 0 || upload.sizeBytes > MAX_UPLOAD_BYTES) fail('Manuscript upload size is invalid.', 'manuscript_size_invalid', 413);
  if (!/^[a-f0-9]{64}$/i.test(upload.checksumSha256)) fail('A valid SHA-256 checksum is required.', 'manuscript_checksum_invalid', 400);
}

export function beginManuscriptPipeline(input: {
  project: PublishingProject;
  upload: ManuscriptUpload;
  identity: PlatformIdentityContext;
  pipelineId: string;
  now?: string;
}): ManuscriptPipelineRecord {
  assertTenant(input.project.tenantId, input.identity);
  assertTenant(input.upload.tenantId, input.identity);
  if (input.upload.publishingProjectId !== input.project.id) fail('Upload does not belong to the publishing project.', 'publishing_project_mismatch');
  validateManuscriptUpload(input.upload);
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.pipelineId,
    tenantId: input.identity.tenantId,
    publishingProjectId: input.project.id,
    sourceAssetId: input.upload.sourceAssetId,
    currentAssetId: input.upload.sourceAssetId,
    stage: 'uploaded',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    issues: []
  };
}

export function transitionManuscriptPipeline(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  nextStage: ManuscriptPipelineStage;
  blockedReason?: string;
  now?: string;
}): ManuscriptPipelineRecord {
  assertTenant(input.pipeline.tenantId, input.identity);
  if (!transitions[input.pipeline.stage].includes(input.nextStage)) {
    fail(`Transition ${input.pipeline.stage} -> ${input.nextStage} is not allowed.`, 'invalid_manuscript_pipeline_transition');
  }
  return {
    ...input.pipeline,
    stage: input.nextStage,
    updatedAt: input.now ?? new Date().toISOString(),
    blockedReason: input.nextStage === 'blocked' ? input.blockedReason ?? 'Manual review required.' : undefined
  };
}

export function recordEditorialAnalysis(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  issues: EditorialIssue[];
  now?: string;
}): ManuscriptPipelineRecord {
  assertTenant(input.pipeline.tenantId, input.identity);
  if (input.pipeline.stage !== 'editorial_analysis') fail('Editorial analysis stage is required.', 'editorial_stage_required');
  return { ...input.pipeline, issues: input.issues, updatedAt: input.now ?? new Date().toISOString() };
}

export function proposeManuscriptRevision(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  proposalId: string;
  proposedAssetId: string;
  summary: string;
  now?: string;
}): ManuscriptPipelineRecord {
  assertTenant(input.pipeline.tenantId, input.identity);
  if (input.pipeline.stage !== 'editorial_analysis') fail('Editorial analysis must finish before revision is proposed.', 'editorial_stage_required');
  const now = input.now ?? new Date().toISOString();
  return {
    ...input.pipeline,
    stage: 'revision_proposed',
    updatedAt: now,
    proposal: {
      id: input.proposalId,
      sourceAssetId: input.pipeline.currentAssetId,
      proposedAssetId: input.proposedAssetId,
      summary: input.summary,
      issueIds: input.pipeline.issues.map(issue => issue.id),
      createdAt: now,
      createdBy: input.identity.subject,
      decision: 'pending'
    }
  };
}

export function decideManuscriptRevision(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  decision: 'approved' | 'changes_requested' | 'rejected';
  now?: string;
}): ManuscriptPipelineRecord {
  assertTenant(input.pipeline.tenantId, input.identity);
  if (input.pipeline.stage !== 'customer_review' || !input.pipeline.proposal) fail('Customer review stage and a proposal are required.', 'customer_review_required');
  const now = input.now ?? new Date().toISOString();
  const approved = input.decision === 'approved';
  return {
    ...input.pipeline,
    stage: approved ? 'revision_approved' : input.decision === 'changes_requested' ? 'revision_proposed' : 'blocked',
    currentAssetId: approved ? input.pipeline.proposal.proposedAssetId : input.pipeline.currentAssetId,
    revision: approved ? input.pipeline.revision + 1 : input.pipeline.revision,
    updatedAt: now,
    blockedReason: input.decision === 'rejected' ? 'Customer rejected the proposed revision.' : undefined,
    proposal: { ...input.pipeline.proposal, decision: input.decision, decidedAt: now }
  };
}

export function completeKdpReadinessReview(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  reportId: string;
  profile: KdpReadinessProfile;
  issues: EditorialIssue[];
  now?: string;
}): ManuscriptPipelineRecord {
  assertTenant(input.pipeline.tenantId, input.identity);
  if (input.pipeline.stage !== 'kdp_readiness_review') fail('KDP readiness review stage is required.', 'kdp_review_stage_required');
  const now = input.now ?? new Date().toISOString();
  const hasBlocking = input.issues.some(issue => issue.severity === 'blocking');
  const hasWarning = input.issues.some(issue => issue.severity === 'warning');
  const status: KdpReadinessReport['status'] = hasBlocking ? 'blocked' : hasWarning ? 'ready_with_warnings' : 'ready';
  return {
    ...input.pipeline,
    stage: hasBlocking ? 'revision_proposed' : 'ready_for_export',
    updatedAt: now,
    issues: input.issues,
    readinessReport: {
      id: input.reportId,
      checkedAt: now,
      profile: input.profile,
      status,
      issues: input.issues,
      disclaimer: 'MMG KDP-readiness review is a production quality-control assessment. Final file acceptance and publication decisions remain with Amazon KDP.'
    }
  };
}
