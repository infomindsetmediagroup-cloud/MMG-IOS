import { createHash, randomUUID } from 'node:crypto';
import {
  KAIROS_PROJECT_VERSION,
  createInitialStages,
  validateProjectForRun,
  validateSourceAsset,
  type AssetRole,
  type KairosProjectMetadata,
  type KairosPublishingProject,
  type KairosSourceAsset,
  type PipelineStageName,
  type StageStatus,
} from './contracts.js';
import {
  ProjectNotFoundError,
  type PublishingProjectRepository,
} from './repository.js';
import {
  assertCanonicalStageOrder,
  transitionStage,
} from './state-machine.js';

export interface PublishingClock {
  now(): string;
}

export interface PublishingIdGenerator {
  projectId(): string;
  assetId(): string;
}

export interface CreatePublishingProjectInput {
  metadata?: KairosProjectMetadata;
}

export interface AddSourceAssetInput {
  projectId: string;
  role: Exclude<AssetRole, 'GENERATED_ARTIFACT'>;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  storageKey: string;
}

export interface TransitionProjectStageInput {
  projectId: string;
  stage: PipelineStageName;
  status: StageStatus;
  errorCode?: string;
  errorMessage?: string;
  requiresHumanReview?: boolean;
}

export class PublishingValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join('; '));
    this.name = 'PublishingValidationError';
    this.errors = errors;
  }
}

export class DuplicateSourceAssetError extends Error {
  constructor(projectId: string, role: AssetRole) {
    super(`Project ${projectId} already has a ${role} asset`);
    this.name = 'DuplicateSourceAssetError';
  }
}

const systemClock: PublishingClock = {
  now: () => new Date().toISOString(),
};

const systemIds: PublishingIdGenerator = {
  projectId: () => `kp_${randomUUID()}`,
  assetId: () => `ka_${randomUUID()}`,
};

export class PublishingProjectService {
  constructor(
    private readonly repository: PublishingProjectRepository,
    private readonly clock: PublishingClock = systemClock,
    private readonly ids: PublishingIdGenerator = systemIds,
  ) {}

  async createProject(input: CreatePublishingProjectInput = {}): Promise<KairosPublishingProject> {
    const now = this.clock.now();
    const project: KairosPublishingProject = {
      id: this.ids.projectId(),
      schemaVersion: KAIROS_PROJECT_VERSION,
      status: 'DRAFT',
      metadata: sanitizeMetadata(input.metadata ?? {}),
      sourceAssets: [],
      stages: createInitialStages(),
      artifacts: [],
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(project);
  }

  async getProject(projectId: string): Promise<KairosPublishingProject> {
    const project = await this.repository.get(projectId);
    if (!project) throw new ProjectNotFoundError(projectId);
    return project;
  }

  async addSourceAsset(input: AddSourceAssetInput): Promise<KairosPublishingProject> {
    const project = await this.getProject(input.projectId);
    assertCanonicalStageOrder(project);

    if (project.sourceAssets.some((asset) => asset.role === input.role)) {
      throw new DuplicateSourceAssetError(project.id, input.role);
    }

    const now = this.clock.now();
    const asset: KairosSourceAsset = {
      id: this.ids.assetId(),
      projectId: project.id,
      role: input.role,
      filename: sanitizeFilename(input.filename),
      mimeType: input.mimeType.trim().toLowerCase(),
      byteSize: input.bytes.byteLength,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      storageKey: input.storageKey.trim(),
      immutable: true,
      createdAt: now,
    };

    const validation = validateSourceAsset(asset);
    if (!validation.ok) throw new PublishingValidationError(validation.errors);

    const next = structuredClone(project);
    next.sourceAssets.push(asset);
    next.updatedAt = now;
    next.status = next.sourceAssets.some((source) => source.role === 'COVER_SOURCE')
      && next.sourceAssets.some((source) => source.role === 'MANUSCRIPT_SOURCE')
      ? 'READY'
      : 'DRAFT';

    return this.repository.save(next);
  }

  async assertReadyToRun(projectId: string): Promise<KairosPublishingProject> {
    const project = await this.getProject(projectId);
    assertCanonicalStageOrder(project);
    const validation = validateProjectForRun(project);
    if (!validation.ok) throw new PublishingValidationError(validation.errors);
    return project;
  }

  async transitionStage(input: TransitionProjectStageInput): Promise<KairosPublishingProject> {
    const project = await this.getProject(input.projectId);
    assertCanonicalStageOrder(project);
    const next = transitionStage(project, {
      stage: input.stage,
      status: input.status,
      at: this.clock.now(),
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      requiresHumanReview: input.requiresHumanReview,
    });
    return this.repository.save(next);
  }
}

function sanitizeMetadata(metadata: KairosProjectMetadata): KairosProjectMetadata {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
  ) as KairosProjectMetadata;
}

function sanitizeFilename(filename: string): string {
  const normalized = filename.trim().replace(/\\/g, '/').split('/').at(-1) ?? '';
  const safe = normalized.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ');
  if (!safe || safe === '.' || safe === '..') {
    throw new PublishingValidationError(['asset filename is invalid']);
  }
  return safe;
}
