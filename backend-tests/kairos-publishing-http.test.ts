import { describe, expect, it } from 'vitest';
import { createPublishingHttpHandler } from '../server/kairos/publishing/http.js';
import { InMemoryPublishingProjectRepository } from '../server/kairos/publishing/repository.js';
import { PublishingProjectService } from '../server/kairos/publishing/service.js';

function createHarness(authorized = true) {
  let projectCounter = 0;
  let assetCounter = 0;
  let tick = 0;
  const service = new PublishingProjectService(
    new InMemoryPublishingProjectRepository(),
    { now: () => `2026-07-22T02:00:${String(tick++).padStart(2, '0')}.000Z` },
    {
      projectId: () => `project_${++projectCounter}`,
      assetId: () => `asset_${++assetCounter}`,
    },
  );
  const handler = createPublishingHttpHandler({ service, authorize: () => authorized });
  return { handler, service };
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

describe('Kairos publishing HTTP handler', () => {
  it('ignores unrelated routes', async () => {
    const { handler } = createHarness();
    await expect(handler(new Request('https://kairos.test/api/health'))).resolves.toBeNull();
  });

  it('creates and retrieves a project', async () => {
    const { handler } = createHarness();
    const created = await handler(new Request('https://kairos.test/api/kairos/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { workingTitle: 'First Guide' } }),
    }));

    expect(created?.status).toBe(201);
    expect(created?.headers.get('Location')).toBe('/api/kairos/projects/project_1');
    const createdBody = await body(created!);
    expect(createdBody.project).toMatchObject({ id: 'project_1', status: 'DRAFT' });

    const retrieved = await handler(new Request('https://kairos.test/api/kairos/projects/project_1'));
    expect(retrieved?.status).toBe(200);
    expect((await body(retrieved!)).project.metadata.workingTitle).toBe('First Guide');
  });

  it('accepts binary source uploads and reports readiness', async () => {
    const { handler, service } = createHarness();
    await service.createProject();

    const cover = await handler(new Request('https://kairos.test/api/kairos/projects/project_1/assets?role=COVER_SOURCE', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'X-Kairos-Filename': 'cover.png',
        'X-Kairos-Storage-Key': 'projects/project_1/source/cover.png',
      },
      body: new Uint8Array([1, 2, 3]),
    }));
    expect(cover?.status).toBe(201);
    expect((await body(cover!)).projectStatus).toBe('DRAFT');

    const manuscript = await handler(new Request('https://kairos.test/api/kairos/projects/project_1/assets?role=MANUSCRIPT_SOURCE', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-Kairos-Filename': 'manuscript.txt',
        'X-Kairos-Storage-Key': 'projects/project_1/source/manuscript.txt',
      },
      body: 'Manuscript content',
    }));
    expect(manuscript?.status).toBe(201);
    expect((await body(manuscript!)).projectStatus).toBe('READY');
  });

  it('maps validation and conflict failures to stable API errors', async () => {
    const { handler, service } = createHarness();
    await service.createProject();

    const invalid = await handler(new Request('https://kairos.test/api/kairos/projects/project_1/assets?role=MANUSCRIPT_SOURCE', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-msdownload',
        'X-Kairos-Filename': 'manuscript.exe',
        'X-Kairos-Storage-Key': 'source/manuscript.exe',
      },
      body: new Uint8Array([1]),
    }));
    expect(invalid?.status).toBe(422);
    expect((await body(invalid!)).error.code).toBe('validation_failed');

    const transition = await handler(new Request('https://kairos.test/api/kairos/projects/project_1/stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: 'SOURCE_VALIDATION', status: 'RUNNING' }),
    }));
    expect(transition?.status).toBe(409);
    expect((await body(transition!)).error.code).toBe('invalid_stage_transition');
  });

  it('requires authentication when an authorizer is configured', async () => {
    const { handler } = createHarness(false);
    const response = await handler(new Request('https://kairos.test/api/kairos/projects'));
    expect(response?.status).toBe(401);
    expect((await body(response!)).error.code).toBe('unauthorized');
  });

  it('rejects malformed JSON and unsupported methods', async () => {
    const { handler } = createHarness();
    const malformed = await handler(new Request('https://kairos.test/api/kairos/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }));
    expect(malformed?.status).toBe(400);
    expect((await body(malformed!)).error.code).toBe('invalid_json');

    const method = await handler(new Request('https://kairos.test/api/kairos/projects/project_1', {
      method: 'DELETE',
    }));
    expect(method?.status).toBe(405);
    expect(method?.headers.get('Allow')).toBe('GET');
  });
});
