import type { PlatformIdentityContext } from '../../platform/contracts.js';
import type { ManuscriptRecord, PublishingAsset, PublishingProject } from './contracts.js';

export type ManuscriptFileType = 'docx' | 'pdf' | 'txt' | 'rtf' | 'odt';
export type ManuscriptPipelineStage =
  | 'uploaded'
  | 'validated'
  | 'extracted'
  | 'editorial_analysis'
  | 'revision_proposed'
  | 'customer_review'
  | 'revision_approved'
  | 'kdp_readiness_review'
  | 'ready_for_export'
  | 'blocked';

export type KdpEditionType = 'paperback' | 'hardcover' | 'ebook';

export interface KdpReadinessProfile {
  edition: KdpEditionType;
  trimWidthInches?: number;
  trimHeightInches?: number;
  bleed: boolean;
  language: string;
  requireTableOfContents: boolean;
  requireEmbeddedFonts: boolean;
  minimumImageDpi: number;
  sourceRevision: string;
  sourceUrl?: string;
  reviewedAt: string;
}

export interface ManuscriptUploadInput {
  tenantId: string;
  publishingProjectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  storageAssetId: string;
  title: string;
  wordCount?: number;
}

export interface ManuscriptIssue {
  id: string;
  category:
    | 'spelling'
    | 'grammar'
    | 'punctuation'
    | 'consistency'
    | 'structure'
    | 'front_matter'
    | 'back_matter'
    | 'formatting'
    | 'image'
    | 'metadata'
    | 'kdp_readiness';
  severity: 'info' | 'warning' | 'blocking';
  location?: string;
  message: string;
  recommendation: string;
  evidence?: string;
}

export interface ManuscriptRevisionProposal {
  id: string;
  manuscriptId: string;
  sourceAssetId: string;
  proposedAssetId: string;
  createdAt: string;
  createdBy: string;
  summary: string;
  issueIds: string[];
  customerDecision: 'pending' | 'approved' | 'changes_requested' | 'rejected';
  approvedAt?: string;
}

export interface KdpReadinessReport {
  id: string;
  manuscriptId: string;
  revision: number;
  profile: KdpReadinessProfile;
  checkedAt: string;
  status: 'ready' | 'ready_with_warnings' | 'blocked';
  issues: ManuscriptIssue[];
  disclaimer: string;
}

export interface ManuscriptPipelineRecord {
  id: string;
  tenantId: string;
  publishingProjectId: string;
  manuscriptId: string;
  sourceAssetId: string;
  currentAssetId: string;
  stage: ManuscriptPipelineStage;
  createdAt: string;
  updatedAt: string;
  revision: number;
  issues: ManuscriptIssue[];
  proposal?: ManuscriptRevisionProposal;
  readinessReport?: KdpReadinessReport;
  blockedReason?: string;
}

const MAX_MANUSCRIPT_BYTES = 50 * 1024 * 1024;
const allowedMimeTypes: Record<string, ManuscriptFileType> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'application/vnd.oasis.opendocument.text': 'odt'
};

const stageTransitions: Record<ManuscriptPipelineStage, ManuscriptPipelineStage[]> = {
  uploaded: ['validated', 'blocked'],
  validated: ['extracted', 'blocked'],
  extracted: ['editorial_analysis', 'blocked'],
  editorial_analysis: ['revision_proposed', 'blocked'],
  revision_proposed: ['customer_review', 'blocked'],
  customer_review: ['revision_approved', 'revision_proposed', 'blocked'],
  revision_approved: ['kdp_readiness_review', 'blocked'],
  kdp_readiness_review: ['ready_for_export', 'revision_proposed', 'blocked'],
  ready_for_export: [],
  blocked: ['uploaded', 'validated']
};

function pipelineError(message: string, code: string, statusCode = 409): Error {
  return Object.assign(new Error(message), { code, statusCode });
}

export function validateManuscriptUpload(input: ManuscriptUploadInput): ManuscriptFileType {
  const fileType = allowedMimeTypes[input.mimeType];
  if (!fileType) {
    throw pipelineError('Unsupported manuscript file type.', 'unsupported_manuscript_type', 415);
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_MANUSCRIPT_BYTES) {
    throw pipelineError('Manuscript exceeds the supported upload size.', 'manuscript_size_invalid', 413);
  }
  if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256)) {
    throw pipelineError('A valid SHA-256 checksum is required.', 'manuscript_checksum_invalid', 400);
  }
  return fileType;
}

export function createManuscriptPipeline(input: {
  project: PublishingProject;
  upload: ManuscriptUploadInput;
  identity: PlatformIdentityContext;
  pipelineId: string;
  manuscriptId: string;
  now?: string;
}): { pipeline: ManuscriptPipelineRecord; manuscript: ManuscriptRecord; sourceAsset: PublishingAsset } {
  const { project, upload, identity } = input;
  if (project.tenantId !== identity.tenantId || upload.tenantId !== identity.tenantId) {
    throw pipelineError('Manuscript upload tenant does not match the execution context.', 'cross_tenant_access', 403);
  }
  if (upload.publishingProjectId !== project.id) {
    throw pipelineError('Manuscript upload does not belong to the publishing project.', 'publishing_project_mismatch', 409);
  }
  validateManuscriptUpload(upload);
  const now = input.now ?? new Date().toISOString();
  const manuscript: ManuscriptRecord = {
    id: input.manuscriptId,
    tenantId: identity.tenantId,
    createdAt: now,
    updatedAt: now,
    version: 1,
    publishingProjectId: project.id,
    title: upload.title,
    status: 'draft',
    currentAssetId: upload.storageAssetId,
    wordCount: upload.wordCount,
    revision: 1
  };
  const sourceAsset: PublishingAsset = {
    id: upload.storageAssetId,
    tenantId: identity.tenantId,
    createdAt: now,
    updatedAt: now,
    version: 1,
    name: upload.filename,
    mediaType: upload.mimeType,
    storageKey: upload.storageAssetId,
    checksum: upload.checksumSha256,
    sizeBytes: upload.sizeBytes,
    status: 'active',
    publishingProjectId: project.id,
    assetRole: 'manuscript_source'
  };
  return {
    manuscript,
    sourceAsset,
    pipeline: {
      id: input.pipelineId,
      tenantId: identity.tenantId,
      publishingProjectId: project.id,
      manuscriptId: manuscript.id,
      sourceAssetId: sourceAsset.id,
      currentAssetId: sourceAsset.id,
      stage: 'uploaded',
      createdAt: now,
      updatedAt: now,
      revision: 1,
      issues: []
    }
  };
}

export function transitionManuscriptPipeline(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  nextStage: ManuscriptPipelineStage;
  blockedReason?: string;
  now?: string;
}): ManuscriptPipelineRecord {
  if (input.pipeline.tenantId !== input.identity.tenantId) {
    throw pipelineError('Pipeline tenant does not match the execution context.', 'cross_tenant_access', 403);
  }
  if (!stageTransitions[input.pipeline.stage].includes(input.nextStage)) {
    throw pipelineError(
      `Manuscript pipeline transition ${input.pipeline.stage} -> ${input.nextStage} is not allowed.`,
      'invalid_manuscript_pipeline_transition'
    );
  }
  return {
    ...input.pipeline,
    stage: input.nextStage,
    updatedAt: input.now ?? new Date().toISOString(),
    blockedReason: input.nextStage === 'blocked' ? input.blockedReason ?? 'Manual review required.' : undefined
  };
}

export function attachEditorialIssues(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  issues: ManuscriptIssue[];
  now?: string;
}): ManuscriptPipelineRecord {
  if (input.pipeline.tenantId !== input.identity.tenantId) {
    throw pipelineError('Pipeline tenant does not match the execution context.', 'cross_tenant_access', 403);
  }
  if (input.pipeline.stage !== 'editorial_analysis') {
    throw pipelineError('Editorial issues can only be attached during editorial analysis.', 'editorial_stage_required');
  }
  return { ...input.pipeline, issues: input.issues, updatedAt: input.now ?? new Date().toISOString() };
}

export function createRevisionProposal(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  proposalId: string;
  proposedAssetId: string;
  summary: string;
  now?: string;
}): ManuscriptPipelineRecord {
  if (input.pipeline.tenantId !== input.identity.tenantId) {
    throw pipelineError('Pipeline tenant does not match the execution context.', 'cross_tenant_access', 403);
  }
  if (input.pipeline.stage !== 'editorial_analysis') {
    throw pipelineError('A revision proposal requires completed editorial analysis.', 'editorial_stage_required');
  }
  const now = input.now ?? new Date().toISOString();
  return {
    ...input.pipeline,
    stage: 'revision_proposed',
    updatedAt: now,
    proposal: {
      id: input.proposalId,
      manuscriptId: input.pipeline.manuscriptId,
      sourceAssetId: input.pipeline.currentAssetId,
      proposedAssetId: input.proposedAssetId,
      createdAt: now,
      createdBy: input.identity.subject,
      summary: input.summary,
      issueIds: input.pipeline.issues.map(issue => issue.id),
      customerDecision: 'pending'
    }
  };
}

export function decideRevisionProposal(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  decision: 'approved' | 'changes_requested' | 'rejected';
  now?: string;
}): ManuscriptPipelineRecord {
  if (input.pipeline.tenantId !== input.identity.tenantId) {
    throw pipelineError('Pipeline tenant does not match the execution context.', 'cross_tenant_access', 403);
  }
  if (input.pipeline.stage !== 'customer_review' || !input.pipeline.proposal) {
    throw pipelineError('A pending customer review is required.', 'customer_review_required');
  }
  const now = input.now ?? new Date().toISOString();
  const approved = input.decision === 'approved';
  return {
    ...input.pipeline,
    stage: approved ? 'revision_approved' : input.decision === 'changes_requested' ? 'revision_proposed' : 'blocked',
    currentAssetId: approved ? input.pipeline.proposal.proposedAssetId : input.pipeline.currentAssetId,
    revision: approved ? input.pipeline.revision + 1 : input.pipeline.revision,
    updatedAt: now,
    blockedReason: input.decision === 'rejected' ? 'Customer rejected the proposed revision.' : undefined,
    proposal: {
      ...input.pipeline.proposal,
      customerDecision: input.decision,
      approvedAt: approved ? now : undefined
    }
  };
}

export function completeKdpReadinessReview(input: {
  pipeline: ManuscriptPipelineRecord;
  identity: PlatformIdentityContext;
  reportId: string;
  profile: KdpReadinessProfile;
  issues: ManuscriptIssue[];
  now?: string;
}): ManuscriptPipelineRecord {
  if (input.pipeline.tenantId !== input.identity.tenantId) {
    throw pipelineError('Pipeline tenant does not match the execution context.', 'cross_tenant_access', 403);
  }
  if (input.pipeline.stage !== 'kdp_readiness_review') {
    throw pipelineError('KDP readiness can only be completed during the readiness review stage.', 'kdp_review_stage_required');
  }
  const blocking = input.issues.some(issue => issue.severity === 'blocking');
  const warnings = input.issues.some(issue => issue.severity === 'warning');
  const now = input.now ?? new Date().toISOString();
  const status: KdpReadinessReport['status'] = blocking ? 'blocked' : warnings ? 'ready_with_warnings' : 'ready';
  return {
    ...input.pipeline,
    stage: blocking ? 'revision_proposed' : 'ready_for_export',
    updatedAt: now,
    issues: input.issues,
    readinessReport: {
      id: input.reportId,
      manuscriptId: input.pipeline.manuscriptId,
      revision: input.pipeline.revision,
      profile: input.profile,
      checkedAt: now,
      status,
      issues: input.issues,
      disclaimer:
        'MMG KDP-readiness review is a production quality-control assessment. Final file acceptance and publication decisions remain with Amazon KDP.'
    }
  };
}
