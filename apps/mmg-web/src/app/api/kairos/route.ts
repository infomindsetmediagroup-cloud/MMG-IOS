import { NextRequest, NextResponse } from 'next/server';
import { authorizeKairosRequest, resolveKairosSession, type KairosSession } from '@/lib/kairos/auth';
import { recordKairosAuditEvent } from '@/lib/kairos/audit';
import {
  persistKairosAuditRecord,
  persistKairosResponseMessage,
  persistKairosUserMessage,
  resolveKairosConversation
} from '@/lib/kairos/conversationLifecycle';
import type { KairosRuntimeRequest } from '@/lib/kairos/contracts';
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
  let mode: KairosRuntimeRequest['mode'] = 'public';
  let surface: KairosRuntimeRequest['surface'] = 'website';
  let session: KairosSession = { role: 'public', source: 'anonymous' };
  let conversationId: string | undefined;

  try {
    enforceKairosRateLimit(resolveRateLimitKey(request.headers));

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw runtimeError('invalid_content_type', 'Content-Type must be application/json.', 415);
    }

    const runtimeRequest = parseKairosRuntimeRequest(await request.json());
    session = resolveKairosSession(request.headers);
    authorizeKairosRequest(runtimeRequest, session);

    mode = runtimeRequest.mode;
    surface = runtimeRequest.surface;
    department = resolveKairosDepartment(runtimeRequest);

    const conversation = resolveKairosConversation(runtimeRequest, session);
    conversationId = conversation.conversationId;
    persistKairosUserMessage(conversationId, runtimeRequest);

    const runtimeResponse = await withKairosTimeout(runKairosCore(runtimeRequest));
    const responseWithConversation = { ...runtimeResponse, conversationId };
    persistKairosResponseMessage(conversationId, responseWithConversation);

    const durationMs = Date.now() - startedAt;

    logKairosRuntimeEvent({ requestId, mode, surface, department, status: 'ok', durationMs });
    recordKairosAuditEvent({ requestId, mode, surface, department, status: 'ok', durationMs });
    persistKairosAuditRecord({
      requestId,
      session,
      event: 'kairos.runtime.request',
      status: 'ok',
      metadata: { mode, surface, department, conversationId, durationMs: String(durationMs) }
    });

    return NextResponse.json(responseWithConversation, {
      status: 200,
      headers: { 'x-kairos-request-id': requestId }
    });
  } catch (error) {
    const safeError = toSafeErrorResponse(error);
    const durationMs = Date.now() - startedAt;

    logKairosRuntimeEvent({ requestId, mode, surface, department, status: 'error', durationMs, errorCode: safeError.body.code });
    recordKairosAuditEvent({ requestId, mode, surface, department, status: 'error', durationMs, errorCode: safeError.body.code });
    persistKairosAuditRecord({
      requestId,
      session,
      event: 'kairos.runtime.request',
      status: 'error',
      metadata: {
        mode,
        surface,
        department,
        errorCode: safeError.body.code,
        durationMs: String(durationMs),
        ...(conversationId ? { conversationId } : {})
      }
    });

    return NextResponse.json(safeError.body, {
      status: safeError.statusCode,
      headers: { 'x-kairos-request-id': requestId }
    });
  }
}
