import { NextRequest, NextResponse } from 'next/server';
import { authorizeKairosRequest, resolveKairosSession } from '@/lib/kairos/auth';
import { resolveKairosDepartment } from '@/lib/kairos/departmentRouter';
import { toSafeErrorResponse } from '@/lib/kairos/errors';
import { logKairosRuntimeEvent } from '@/lib/kairos/logging';
import { runKairosCore } from '@/lib/kairos/provider';
import { enforceKairosRateLimit, resolveRateLimitKey } from '@/lib/kairos/rateLimit';
import { withKairosTimeout } from '@/lib/kairos/timeout';
import { parseKairosRuntimeRequest, runtimeError } from '@/lib/kairos/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  let department = 'kairos-core';
  let mode = 'public' as const;
  let surface = 'website' as const;

  try {
    enforceKairosRateLimit(resolveRateLimitKey(request.headers));

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw runtimeError('invalid_content_type', 'Content-Type must be application/json.', 415);
    }

    const runtimeRequest = parseKairosRuntimeRequest(await request.json());
    const session = resolveKairosSession(request.headers);
    authorizeKairosRequest(runtimeRequest, session);

    mode = runtimeRequest.mode;
    surface = runtimeRequest.surface;
    department = resolveKairosDepartment(runtimeRequest);

    const runtimeResponse = await withKairosTimeout(runKairosCore(runtimeRequest));

    logKairosRuntimeEvent({ requestId, mode, surface, department, status: 'ok', durationMs: Date.now() - startedAt });

    return NextResponse.json(runtimeResponse, {
      status: 200,
      headers: { 'x-kairos-request-id': requestId }
    });
  } catch (error) {
    const safeError = toSafeErrorResponse(error);

    logKairosRuntimeEvent({ requestId, mode, surface, department, status: 'error', durationMs: Date.now() - startedAt, errorCode: safeError.body.code });

    return NextResponse.json(safeError.body, {
      status: safeError.statusCode,
      headers: { 'x-kairos-request-id': requestId }
    });
  }
}
