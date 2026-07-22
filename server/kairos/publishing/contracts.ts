export const KAIROS_PROJECT_VERSION = '1.0.0' as const;

export const PROJECT_STATUSES = [
  'DRAFT',
  'READY',
  'RUNNING',
  'REVIEW_REQUIRED',
  'APPROVED_FOR_SHOPIFY_STAGING',
  'COMPLETED',
  'FAILED',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PIPELINE_STAGES = [
  'INTAKE',
  'SOURCE_VALIDATION',
  'MANUSCRIPT_EXTRACTION',
  'METADATA_INFERENCE',
  'EDITORIAL_ANALYSIS',
  'DELIVERABLE_GENERATION',
  'PRODUCT_METADATA_GENERATION',
  'PACKAGE_ASSEMBLY',
  'REVIEW',
  'SHOPIFY_STAGING_HANDOFF',
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];
export type StageStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'BLOCKED';

export const ALLOWED_COVER_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const ALLOWED_MANUSCRIPT_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain',
  'text/markdown',
] as const;

export type AssetRole = 'COVER_SOURCE' | 'MANUSCRIPT_SOURCE' | 'GENERATED_ARTIFACT';

export interface KairosSourceAsset {
  id: string;
  projectId: string;
  role: AssetRole;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  immutable: boolean;
  createdAt: string;
}

export interface KairosProjectMetadata {
  workingTitle?: string;
  subtitle?: string;
  author?: string;
  productType?: 'DIGITAL_BOOK' | 'GUIDE' | 'WORKBOOK' | 'OTHER';
  intendedAudience?: string;
  notes?: string;
}

export interface PipelineStageRecord {
  name: PipelineStageName;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  requiresHumanReview?: boolean;
}

export interface PackageArtifact {
  id: string;
  projectId: string;
  kind:
    | 'ORIGINAL_SOURCE'
    | 'NORMALIZED_MANUSCRIPT'
    | 'EDITABLE_MANUSCRIPT'
    | 'FINAL_MANUSCRIPT'
    | 'COVER_SOURCE'
    | 'STOREFRONT_PRODUCT_IMAGE'
    | 'PRODUCT_METADATA'
    | 'CUSTOMER_README'
    | 'QA_REPORT'
    | 'RIGHTS_DECLARATION'
    | 'PACKAGE_MANIFEST'
    | 'ZIP_ARCHIVE';
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  createdAt: string;
}

export interface ShopifyProductMetadata {
  title: string;
  handle: string;
  descriptionHtml: string;
  seoTitle: string;
  metaDescription: string;
  socialTitle: string;
  socialDescription: string;
  vendor: 'Mindset Media Group';
  productType: 'Digital Product';
  status: 'DRAFT';
}

export interface PackageManifest {
  schemaVersion: typeof KAIROS_PROJECT_VERSION;
  projectId: string;
  generatedAt: string;
  sourceAssetIds: string[];
  artifacts: PackageArtifact[];
  shopifyMetadata: ShopifyProductMetadata;
  qaPassed: boolean;
  rightsDeclarationComplete: boolean;
  liveShopifyMutationAuthorized: false;
}

export interface KairosPublishingProject {
  id: string;
  schemaVersion: typeof KAIROS_PROJECT_VERSION;
  status: ProjectStatus;
  metadata: KairosProjectMetadata;
  sourceAssets: KairosSourceAsset[];
  stages: PipelineStageRecord[];
  artifacts: PackageArtifact[];
  createdAt: string;
  updatedAt: string;
  approvedForShopifyStagingAt?: string;
  completedAt?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createInitialStages(): PipelineStageRecord[] {
  return PIPELINE_STAGES.map((name) => ({ name, status: 'PENDING' }));
}

export function validateSourceAsset(asset: KairosSourceAsset): ValidationResult {
  const errors: string[] = [];

  if (!asset.id.trim()) errors.push('asset.id is required');
  if (!asset.projectId.trim()) errors.push('asset.projectId is required');
  if (!asset.filename.trim()) errors.push('asset.filename is required');
  if (!asset.storageKey.trim()) errors.push('asset.storageKey is required');
  if (!Number.isSafeInteger(asset.byteSize) || asset.byteSize <= 0) {
    errors.push('asset.byteSize must be a positive safe integer');
  }
  if (!SHA256_PATTERN.test(asset.sha256)) errors.push('asset.sha256 must be a 64-character hex digest');
  if (!asset.immutable) errors.push('source assets must be immutable');

  if (asset.role === 'COVER_SOURCE' && !ALLOWED_COVER_MIME_TYPES.includes(asset.mimeType as never)) {
    errors.push(`unsupported cover MIME type: ${asset.mimeType}`);
  }

  if (
    asset.role === 'MANUSCRIPT_SOURCE' &&
    !ALLOWED_MANUSCRIPT_MIME_TYPES.includes(asset.mimeType as never)
  ) {
    errors.push(`unsupported manuscript MIME type: ${asset.mimeType}`);
  }

  return { ok: errors.length === 0, errors };
}

export function validateProjectForRun(project: KairosPublishingProject): ValidationResult {
  const errors: string[] = [];
  const coverAssets = project.sourceAssets.filter((asset) => asset.role === 'COVER_SOURCE');
  const manuscriptAssets = project.sourceAssets.filter((asset) => asset.role === 'MANUSCRIPT_SOURCE');

  if (project.schemaVersion !== KAIROS_PROJECT_VERSION) errors.push('unsupported project schema version');
  if (coverAssets.length !== 1) errors.push('exactly one cover source is required');
  if (manuscriptAssets.length !== 1) errors.push('exactly one manuscript source is required');
  if (project.stages.length !== PIPELINE_STAGES.length) errors.push('all canonical stages are required');

  for (const asset of project.sourceAssets) {
    const result = validateSourceAsset(asset);
    errors.push(...result.errors.map((error) => `${asset.id}: ${error}`));
  }

  return { ok: errors.length === 0, errors };
}

export function validatePackageManifest(manifest: PackageManifest): ValidationResult {
  const errors: string[] = [];
  const kinds = new Set(manifest.artifacts.map((artifact) => artifact.kind));
  const requiredKinds: PackageArtifact['kind'][] = [
    'ORIGINAL_SOURCE',
    'NORMALIZED_MANUSCRIPT',
    'EDITABLE_MANUSCRIPT',
    'FINAL_MANUSCRIPT',
    'COVER_SOURCE',
    'STOREFRONT_PRODUCT_IMAGE',
    'PRODUCT_METADATA',
    'CUSTOMER_README',
    'QA_REPORT',
    'RIGHTS_DECLARATION',
    'PACKAGE_MANIFEST',
    'ZIP_ARCHIVE',
  ];

  for (const kind of requiredKinds) {
    if (!kinds.has(kind)) errors.push(`missing required artifact: ${kind}`);
  }

  if (!manifest.qaPassed) errors.push('QA must pass before package completion');
  if (!manifest.rightsDeclarationComplete) errors.push('rights declaration must be complete');
  if (manifest.liveShopifyMutationAuthorized !== false) {
    errors.push('live Shopify mutation authorization must remain false');
  }
  if (!HANDLE_PATTERN.test(manifest.shopifyMetadata.handle)) {
    errors.push('Shopify handle must be lowercase kebab-case');
  }
  if (manifest.shopifyMetadata.status !== 'DRAFT') {
    errors.push('generated Shopify product status must be DRAFT');
  }

  return { ok: errors.length === 0, errors };
}
