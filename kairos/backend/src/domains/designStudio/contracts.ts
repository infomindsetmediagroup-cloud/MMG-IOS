import type { AssetRecord, PlatformRecordMetadata } from '../../platform/contracts.js';

export type DesignProjectStatus =
  | 'draft'
  | 'in_production'
  | 'review_required'
  | 'approved'
  | 'released'
  | 'archived';

export type DesignModule =
  | 'document'
  | 'cover'
  | 'brand'
  | 'image'
  | 'video'
  | 'social'
  | 'marketing';

export interface DesignProject extends PlatformRecordMetadata {
  objectiveId: string;
  publishingProjectId?: string;
  name: string;
  module: DesignModule;
  projectStatus: DesignProjectStatus;
  sourceAssetIds: string[];
  outputAssetIds: string[];
  approvedDeliverableAssetIds: string[];
}

export interface DesignAsset extends AssetRecord {
  designProjectId: string;
  assetRole: 'source' | 'editable' | 'generation' | 'proof' | 'approved_deliverable';
  editable: boolean;
  parentAssetId?: string;
}

export interface DesignReleaseApproval extends PlatformRecordMetadata {
  designProjectId: string;
  assetIds: string[];
  approvedBy: string;
  approvedAt: string;
  approvalScope: 'customer_deliverable' | 'publishing_release' | 'marketing_release';
}
