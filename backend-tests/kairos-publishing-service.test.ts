import { describe, expect, it } from 'vitest';
import {
  InMemoryPublishingProjectRepository,
  ProjectNotFoundError,
} from '../server/kairos/publishing/repository.js';
import {
  DuplicateSourceAssetError,
  PublishingProjectService,
  PublishingValidationError,
} from '../server/kairos/publishing/service.js';
import { InvalidStageTransitionError } from '../server/kairos/publishing/state-machine.js';

function createHarness() {
  let tick = 0;
  let projectCounter = 0;
  let assetCounter = 0;
  const repository = new InMemoryPublishingProjectRepository();
  const service = new PublishingProjectService(
    repository,
    { now: () => `2026-07-22T01:00:${String(tick++).padStart(2, '0')}.000Z` },
    {
      projectId: () => `project_${++projectCounter}`,
      assetId: () => `asset_${++assetCounter}`,
    },
  );

  return { repository, service };
}

async function addValidSources(service: PublishingProjectService, projectId: string) {
  await service.addSourceAsset({
    projectId,
    role: 'COVER_SOURCE',
    filename: '../cover image.png',
    mimeType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
    storageKey: `projects/${projectId}/source/cover.png`,
  });

  return service.addSourceAsset({
    projectId,
    role: 'MANUSCRIPT_SOURCE',
    filename: 'manuscript.md',
    mimeType: 'text/markdown',
    bytes: new TextEncoder().encode('# Manuscript'),
    storageKey: `projects/${projectId}/source/manuscript.md`,
  });
}

describe('PublishingProjectService', () => {
  it('creates a persistent draft project with sanitized metadata', async () => {
    const { service } = createHarness();
    const project = await service.createProject({
      metadata: {
        workingTitle: '  First Product  ',
        author: ' Michael King ',
        notes: '   ',
      },
    });

    expect(project.id).toBe('project_1');
    expect(project.status).toBe('DRAFT');
    expect(project.metadata).toEqual({
      workingTitle: 'First Product',
      author: 'Michael King',
    });
    expect(await service.getProject(project.id)).toEqual(project);
  });

  it('stores immutable sources, computes checksums, and becomes ready', async () => {
    const { service } = createHarness();
    const project = await service.createProject();
    const ready = await addValidSources(service, project.id);

    expect(ready.status).toBe('READY');
    expect(ready.sourceAssets).toHaveLength(2);
    expect(ready.sourceAssets[0].filename).toBe('cover image.png');
    expect(ready.sourceAssets[0].immutable).toBe(true);
    expect(ready.sourceAssets[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(service.assertReadyToRun(project.id)).resolves.toEqual(ready);
  });

  it('rejects duplicate source roles and unsupported files', async () => {
    const { service } = createHarness();
    const project = await service.createProject();

    await service.addSourceAsset({
      projectId: project.id,
      role: 'COVER_SOURCE',
      filename: 'cover.jpg',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1]),
      storageKey: 'source/cover.jpg',
    });

    await expect(service.addSourceAsset({
      projectId: project.id,
      role: 'COVER_SOURCE',
      filename: 'second.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([2]),
      storageKey: 'source/second.png',
    })).rejects.toBeInstanceOf(DuplicateSourceAssetError);

    const other = await service.createProject();
    await expect(service.addSourceAsset({
      projectId: other.id,
      role: 'MANUSCRIPT_SOURCE',
      filename: 'manuscript.exe',
      mimeType: 'application/x-msdownload',
      bytes: new Uint8Array([3]),
      storageKey: 'source/manuscript.exe',
    })).rejects.toBeInstanceOf(PublishingValidationError);
  });

  it('requires both canonical sources before running', async () => {
    const { service } = createHarness();
    const project = await service.createProject();

    await expect(service.assertReadyToRun(project.id)).rejects.toMatchObject({
      errors: expect.arrayContaining([
        'exactly one cover source is required',
        'exactly one manuscript source is required',
      ]),
    });
  });

  it('enforces ordered stage transitions', async () => {
    const { service } = createHarness();
    const project = await service.createProject();
    await addValidSources(service, project.id);

    await expect(service.transitionStage({
      projectId: project.id,
      stage: 'SOURCE_VALIDATION',
      status: 'RUNNING',
    })).rejects.toBeInstanceOf(InvalidStageTransitionError);

    const running = await service.transitionStage({
      projectId: project.id,
      stage: 'INTAKE',
      status: 'RUNNING',
    });
    expect(running.status).toBe('RUNNING');

    const completed = await service.transitionStage({
      projectId: project.id,
      stage: 'INTAKE',
      status: 'SUCCEEDED',
    });
    expect(completed.stages[0].status).toBe('SUCCEEDED');
    expect(completed.status).toBe('READY');

    const sourceValidation = await service.transitionStage({
      projectId: project.id,
      stage: 'SOURCE_VALIDATION',
      status: 'RUNNING',
    });
    expect(sourceValidation.stages[1].status).toBe('RUNNING');
  });

  it('moves failed and blocked stages into governed project states', async () => {
    const { service } = createHarness();
    const failedProject = await service.createProject();
    await addValidSources(service, failedProject.id);
    await service.transitionStage({ projectId: failedProject.id, stage: 'INTAKE', status: 'RUNNING' });
    const failed = await service.transitionStage({
      projectId: failedProject.id,
      stage: 'INTAKE',
      status: 'FAILED',
      errorCode: 'intake_failed',
      errorMessage: 'Source could not be secured.',
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.stages[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'intake_failed',
      requiresHumanReview: true,
    });

    const blockedProject = await service.createProject();
    await addValidSources(service, blockedProject.id);
    await service.transitionStage({ projectId: blockedProject.id, stage: 'INTAKE', status: 'RUNNING' });
    const blocked = await service.transitionStage({
      projectId: blockedProject.id,
      stage: 'INTAKE',
      status: 'BLOCKED',
      errorCode: 'rights_review_required',
    });
    expect(blocked.status).toBe('REVIEW_REQUIRED');
  });

  it('returns not found for unknown project IDs', async () => {
    const { service } = createHarness();
    await expect(service.getProject('missing')).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});
