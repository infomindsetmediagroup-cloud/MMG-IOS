import {
  PIPELINE_STAGES,
  type KairosPublishingProject,
  type PipelineStageName,
  type ProjectStatus,
  type StageStatus,
} from './contracts.js';

const TERMINAL_STAGE_STATUSES = new Set<StageStatus>(['SUCCEEDED', 'FAILED', 'BLOCKED']);

export class InvalidStageTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStageTransitionError';
  }
}

export interface StageTransitionInput {
  stage: PipelineStageName;
  status: StageStatus;
  at: string;
  errorCode?: string;
  errorMessage?: string;
  requiresHumanReview?: boolean;
}

export function transitionStage(
  project: KairosPublishingProject,
  input: StageTransitionInput,
): KairosPublishingProject {
  const next = structuredClone(project);
  const index = next.stages.findIndex((stage) => stage.name === input.stage);
  if (index < 0) throw new InvalidStageTransitionError(`Unknown stage: ${input.stage}`);

  const current = next.stages[index];
  if (TERMINAL_STAGE_STATUSES.has(current.status)) {
    throw new InvalidStageTransitionError(`${input.stage} is already terminal: ${current.status}`);
  }

  if (input.status === 'RUNNING') {
    const previous = next.stages.slice(0, index);
    if (previous.some((stage) => stage.status !== 'SUCCEEDED')) {
      throw new InvalidStageTransitionError(`${input.stage} cannot start before all previous stages succeed`);
    }
    if (current.status !== 'PENDING') {
      throw new InvalidStageTransitionError(`${input.stage} can only start from PENDING`);
    }
    current.status = 'RUNNING';
    current.startedAt = input.at;
  } else if (input.status === 'SUCCEEDED') {
    if (current.status !== 'RUNNING') {
      throw new InvalidStageTransitionError(`${input.stage} can only succeed from RUNNING`);
    }
    current.status = 'SUCCEEDED';
    current.completedAt = input.at;
    current.requiresHumanReview = input.requiresHumanReview;
  } else if (input.status === 'FAILED' || input.status === 'BLOCKED') {
    if (current.status !== 'RUNNING') {
      throw new InvalidStageTransitionError(`${input.stage} can only ${input.status.toLowerCase()} from RUNNING`);
    }
    current.status = input.status;
    current.completedAt = input.at;
    current.errorCode = input.errorCode;
    current.errorMessage = input.errorMessage;
    current.requiresHumanReview = input.requiresHumanReview ?? true;
  } else {
    throw new InvalidStageTransitionError(`Direct transition to ${input.status} is not allowed`);
  }

  next.updatedAt = input.at;
  next.status = deriveProjectStatus(next);
  return next;
}

export function deriveProjectStatus(project: KairosPublishingProject): ProjectStatus {
  const failed = project.stages.find((stage) => stage.status === 'FAILED');
  if (failed) return 'FAILED';

  const blocked = project.stages.find((stage) => stage.status === 'BLOCKED');
  if (blocked) return 'REVIEW_REQUIRED';

  const review = project.stages.find((stage) => stage.name === 'REVIEW');
  const staging = project.stages.find((stage) => stage.name === 'SHOPIFY_STAGING_HANDOFF');

  if (staging?.status === 'SUCCEEDED') return 'COMPLETED';
  if (review?.status === 'SUCCEEDED') return 'APPROVED_FOR_SHOPIFY_STAGING';
  if (project.stages.some((stage) => stage.status === 'RUNNING')) return 'RUNNING';
  if (project.sourceAssets.length >= 2) return 'READY';
  return 'DRAFT';
}

export function nextPendingStage(project: KairosPublishingProject): PipelineStageName | null {
  const stage = project.stages.find((candidate) => candidate.status === 'PENDING');
  return stage?.name ?? null;
}

export function assertCanonicalStageOrder(project: KairosPublishingProject): void {
  const actual = project.stages.map((stage) => stage.name);
  if (actual.length !== PIPELINE_STAGES.length || actual.some((name, index) => name !== PIPELINE_STAGES[index])) {
    throw new InvalidStageTransitionError('Project stages do not match the canonical pipeline order');
  }
}
