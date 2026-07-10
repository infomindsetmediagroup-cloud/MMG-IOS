import type { AssetRecord, PlatformRecordMetadata } from '../../platform/contracts.js';

export type PublishingProjectStatus =
  | 'intake'
  | 'manuscript_development'
  | 'editorial_review'
  | 'design_and_formatting'
  | 'production_review'
  | 'executive_approval'
  | 'release_ready'
  | 'released'
  | 'cancelled';

export type ManuscriptStatus =
  | 'draft'
  | 'editorial_review'
  | 'revision_required'
  | 'approved_for_design'
  | 'locked_for_production';

type PublishingRecordMetadata = Omit<PlatformRecordMetadata, 'status'>;

export interface PublishingProject extends PublishingRecordMetadata {
  objectiveId: string;
  title: string;
  authorSubject: string;
  status: PublishingProjectStatus;
  manuscriptId?: string;
  workflowId?: string;
  approvalId?: string;
  releasedAt?: string;
}

export interface ManuscriptRecord extends PublishingRecordMetadata {
  publishingProjectId: string;
  title: string;
  status: ManuscriptStatus;
  currentAssetId: string;
  wordCount?: number;
  revision: number;
}

export interface PublishingApprovalRecord extends PlatformRecordMetadata {
  publishingProjectId: string;
  approvedBy: string;
  approvedAt: string;
  approvalType: 'production' | 'release';
  notes?: string;
}

export interface PublishingAsset extends AssetRecord {
  publishingProjectId: string;
  assetRole:
    | 'manuscript_source'
    | 'edited_manuscript'
    | 'cover_source'
    | 'interior_source'
    | 'proof'
    | 'final_deliverable';
}

export interface PublishingFactEventPayload {
  publishingProjectId: string;
  previousStatus?: PublishingProjectStatus;
  status: PublishingProjectStatus;
  workflowId?: string;
  approvalId?: string;
}
