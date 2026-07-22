import { describe, expect, it } from 'vitest';
import {
  KAIROS_PROJECT_VERSION,
  createInitialStages,
  validatePackageManifest,
  validateProjectForRun,
  type KairosPublishingProject,
  type PackageArtifact,
  type PackageManifest,
} from '../server/kairos/publishing/contracts.js';

const now = '2026-07-22T01:00:00.000Z';
const sha = 'a'.repeat(64);

function createValidProject(): KairosPublishingProject {
  return {
    id: 'project_001',
    schemaVersion: KAIROS_PROJECT_VERSION,
    status: 'READY',
    metadata: {
      workingTitle: 'Representative Digital Guide',
      author: 'Michael King',
      productType: 'GUIDE',
    },
    sourceAssets: [
      {
        id: 'asset_cover',
        projectId: 'project_001',
        role: 'COVER_SOURCE',
        filename: 'cover.png',
        mimeType: 'image/png',
        byteSize: 2048,
        sha256: sha,
        storageKey: 'projects/project_001/source/cover.png',
        immutable: true,
        createdAt: now,
      },
      {
        id: 'asset_manuscript',
        projectId: 'project_001',
        role: 'MANUSCRIPT_SOURCE',
        filename: 'manuscript.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        byteSize: 4096,
        sha256: sha,
        storageKey: 'projects/project_001/source/manuscript.docx',
        immutable: true,
        createdAt: now,
      },
    ],
    stages: createInitialStages(),
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createArtifacts(): PackageArtifact[] {
  const kinds: PackageArtifact['kind'][] = [
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

  return kinds.map((kind, index) => ({
    id: `artifact_${index}`,
    projectId: 'project_001',
    kind,
    filename: `${kind.toLowerCase()}.bin`,
    mimeType: 'application/octet-stream',
    byteSize: 100 + index,
    sha256: sha,
    storageKey: `projects/project_001/artifacts/${kind.toLowerCase()}.bin`,
    createdAt: now,
  }));
}

describe('Kairos publishing contracts', () => {
  it('creates the canonical ordered stage set', () => {
    const stages = createInitialStages();

    expect(stages).toHaveLength(10);
    expect(stages[0]).toEqual({ name: 'INTAKE', status: 'PENDING' });
    expect(stages.at(-1)).toEqual({ name: 'SHOPIFY_STAGING_HANDOFF', status: 'PENDING' });
  });

  it('accepts one immutable cover and one immutable manuscript', () => {
    const result = validateProjectForRun(createValidProject());

    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects missing sources, unsupported MIME types, and mutable files', () => {
    const project = createValidProject();
    project.sourceAssets = [
      {
        ...project.sourceAssets[0],
        mimeType: 'image/svg+xml',
        immutable: false,
        sha256: 'not-a-checksum',
      },
    ];

    const result = validateProjectForRun(project);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('exactly one manuscript source is required');
    expect(result.errors.some((error) => error.includes('unsupported cover MIME type'))).toBe(true);
    expect(result.errors.some((error) => error.includes('source assets must be immutable'))).toBe(true);
    expect(result.errors.some((error) => error.includes('64-character hex digest'))).toBe(true);
  });

  it('accepts a complete governed package manifest', () => {
    const manifest: PackageManifest = {
      schemaVersion: KAIROS_PROJECT_VERSION,
      projectId: 'project_001',
      generatedAt: now,
      sourceAssetIds: ['asset_cover', 'asset_manuscript'],
      artifacts: createArtifacts(),
      shopifyMetadata: {
        title: 'Representative Digital Guide',
        handle: 'representative-digital-guide',
        descriptionHtml: '<p>Production-ready guide.</p>',
        seoTitle: 'Representative Digital Guide | Mindset Media Group',
        metaDescription: 'A production-ready digital guide from Mindset Media Group.',
        socialTitle: 'Representative Digital Guide',
        socialDescription: 'Build with clarity using this digital guide.',
        vendor: 'Mindset Media Group',
        productType: 'Digital Product',
        status: 'DRAFT',
      },
      qaPassed: true,
      rightsDeclarationComplete: true,
      liveShopifyMutationAuthorized: false,
    };

    expect(validatePackageManifest(manifest)).toEqual({ ok: true, errors: [] });
  });

  it('blocks incomplete packages and live Shopify authorization', () => {
    const manifest = {
      schemaVersion: KAIROS_PROJECT_VERSION,
      projectId: 'project_001',
      generatedAt: now,
      sourceAssetIds: ['asset_cover', 'asset_manuscript'],
      artifacts: createArtifacts().filter((artifact) => artifact.kind !== 'ZIP_ARCHIVE'),
      shopifyMetadata: {
        title: 'Bad Package',
        handle: 'Bad Handle',
        descriptionHtml: '<p>Incomplete.</p>',
        seoTitle: 'Bad Package',
        metaDescription: 'Incomplete package.',
        socialTitle: 'Bad Package',
        socialDescription: 'Incomplete package.',
        vendor: 'Mindset Media Group',
        productType: 'Digital Product',
        status: 'ACTIVE',
      },
      qaPassed: false,
      rightsDeclarationComplete: false,
      liveShopifyMutationAuthorized: true,
    } as unknown as PackageManifest;

    const result = validatePackageManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('missing required artifact: ZIP_ARCHIVE');
    expect(result.errors).toContain('QA must pass before package completion');
    expect(result.errors).toContain('rights declaration must be complete');
    expect(result.errors).toContain('live Shopify mutation authorization must remain false');
    expect(result.errors).toContain('Shopify handle must be lowercase kebab-case');
    expect(result.errors).toContain('generated Shopify product status must be DRAFT');
  });
});
