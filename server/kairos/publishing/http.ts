import {
  DuplicateSourceAssetError,
  PublishingProjectService,
  PublishingValidationError,
} from './service.js';
import { ProjectNotFoundError } from './repository.js';
import { InvalidStageTransitionError } from './state-machine.js';
import type { AssetRole, KairosProjectMetadata, PipelineStageName, StageStatus } from './contracts.js';

const PROJECT_COLLECTION_PATH = '/api/kairos/projects';
const MAX_JSON_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export interface PublishingHttpHandlerOptions {
  service: PublishingProjectService;
  authorize?: (request: Request) => boolean | Promise<boolean>;
}

export function createPublishingHttpHandler(options: PublishingHttpHandlerOptions) {
  return async function handlePublishingRequest(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(PROJECT_COLLECTION_PATH)) return null;

    if (options.authorize && !(await options.authorize(request))) {
      return json({ status: 'unauthorized', error: { code: 'unauthorized', message: 'Authentication required.' } }, 401);
    }

    try {
      if (request.method === 'POST' && url.pathname === PROJECT_COLLECTION_PATH) {
        const payload = await readJson<CreateProjectPayload>(request);
        const project = await options.service.createProject({ metadata: payload.metadata });
        return json({ status: 'created', project }, 201, { Location: `${PROJECT_COLLECTION_PATH}/${project.id}` });
      }

      const match = url.pathname.match(/^\/api\/kairos\/projects\/([^/]+)(?:\/(assets|stages))?$/);
      if (!match) return json({ status: 'not-found', error: { code: 'route_not_found', message: 'Route not found.' } }, 404);

      const projectId = decodeURIComponent(match[1]);
      const subresource = match[2];

      if (request.method === 'GET' && !subresource) {
        const project = await options.service.getProject(projectId);
        return json({ status: 'completed', project });
      }

      if (request.method === 'POST' && subresource === 'assets') {
        const role = normalizeAssetRole(url.searchParams.get('role'));
        const filename = requiredHeader(request, 'X-Kairos-Filename');
        const storageKey = requiredHeader(request, 'X-Kairos-Storage-Key');
        const mimeType = request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() ?? '';
        const declaredLength = Number(request.headers.get('Content-Length') ?? '0');
        if (declaredLength > MAX_SOURCE_BYTES) throw new HttpError(413, 'asset_too_large', 'Source asset exceeds 50 MB.');

        const bytes = new Uint8Array(await request.arrayBuffer());
        if (bytes.byteLength === 0) throw new HttpError(400, 'empty_asset', 'Source asset body is empty.');
        if (bytes.byteLength > MAX_SOURCE_BYTES) throw new HttpError(413, 'asset_too_large', 'Source asset exceeds 50 MB.');

        const project = await options.service.addSourceAsset({
          projectId,
          role,
          filename,
          mimeType,
          bytes,
          storageKey,
        });
        const asset = project.sourceAssets.at(-1);
        return json({ status: 'created', asset, projectStatus: project.status }, 201);
      }

      if (request.method === 'POST' && subresource === 'stages') {
        const payload = await readJson<TransitionStagePayload>(request);
        const project = await options.service.transitionStage({
          projectId,
          stage: payload.stage,
          status: payload.status,
          errorCode: payload.errorCode,
          errorMessage: payload.errorMessage,
          requiresHumanReview: payload.requiresHumanReview,
        });
        return json({ status: 'completed', project });
      }

      return json({ status: 'method-not-allowed', error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, 405, {
        Allow: subresource === 'assets' || subresource === 'stages' ? 'POST' : 'GET',
      });
    } catch (error) {
      return mapError(error);
    }
  };
}

interface CreateProjectPayload {
  metadata?: KairosProjectMetadata;
}

interface TransitionStagePayload {
  stage: PipelineStageName;
  status: StageStatus;
  errorCode?: string;
  errorMessage?: string;
  requiresHumanReview?: boolean;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json.');

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    throw new HttpError(413, 'payload_too_large', 'JSON payload exceeds 64 KB.');
  }

  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must contain valid JSON.');
  }
}

function normalizeAssetRole(value: string | null): Exclude<AssetRole, 'GENERATED_ARTIFACT'> {
  if (value === 'COVER_SOURCE' || value === 'MANUSCRIPT_SOURCE') return value;
  throw new HttpError(400, 'invalid_asset_role', 'Asset role must be COVER_SOURCE or MANUSCRIPT_SOURCE.');
}

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new HttpError(400, 'missing_header', `${name} is required.`);
  return value;
}

function mapError(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ status: 'rejected', error: { code: error.code, message: error.message } }, error.status);
  }
  if (error instanceof ProjectNotFoundError) {
    return json({ status: 'not-found', error: { code: 'project_not_found', message: error.message } }, 404);
  }
  if (error instanceof DuplicateSourceAssetError) {
    return json({ status: 'conflict', error: { code: 'duplicate_source_asset', message: error.message } }, 409);
  }
  if (error instanceof PublishingValidationError) {
    return json({ status: 'rejected', error: { code: 'validation_failed', message: error.message, details: error.errors } }, 422);
  }
  if (error instanceof InvalidStageTransitionError) {
    return json({ status: 'conflict', error: { code: 'invalid_stage_transition', message: error.message } }, 409);
  }
  return json({ status: 'failed', error: { code: 'internal_error', message: 'Kairos could not complete the request.' } }, 500);
}

function json(value: unknown, status = 200, additionalHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Kairos-Publishing-Contract': '1.0.0',
      ...additionalHeaders,
    },
  });
}
