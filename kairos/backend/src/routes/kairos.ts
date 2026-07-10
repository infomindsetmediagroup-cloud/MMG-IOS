import type { Request, Response } from 'express';
import type { KairosMode, KairosSurface } from '../runtime/contracts.js';
import { toSafeErrorResponse } from '../runtime/errors.js';
import { logKairosRuntimeEvent } from '../runtime/logging.js';
import { runKairosCore } from '../runtime/openaiClient.js';
import { parseKairosRuntimeRequest } from '../runtime/validation.js';
import { authorizeKairosRequest, type KairosAuthorizationContext } from '../security/authorization.js';

export async function handleKairosRequest(req: Request, res: Response): Promise<void> {
  let mode: KairosMode = 'public';
  let surface: KairosSurface = 'website';
  const department = 'kairos-core';
  let authorization: KairosAuthorizationContext | undefined;

  try {
    authorization = authorizeKairosRequest(req);

    if (!req.is('application/json')) {
      throw Object.assign(new Error('Content-Type must be application/json.'), {
        code: 'invalid_content_type',
        statusCode: 415
      });
    }

    const runtimeRequest = parseKairosRuntimeRequest(req.body);
    mode = runtimeRequest.mode;
    surface = runtimeRequest.surface;

    const runtimeResponse = await runKairosCore(runtimeRequest);

    logKairosRuntimeEvent({
      mode,
      surface,
      department,
      status: 'ok',
      authorizationMode: authorization.mode,
      subject: authorization.session.sub,
      tenantId: authorization.session.tenantId,
      role: authorization.session.role,
      sessionId: authorization.session.sessionId
    });

    res.status(200).json({
      ...runtimeResponse,
      executionContext: {
        authorizationMode: authorization.mode,
        subject: authorization.session.sub,
        tenantId: authorization.session.tenantId,
        role: authorization.session.role,
        sessionId: authorization.session.sessionId
      }
    });
  } catch (error) {
    const safeError = toSafeErrorResponse(error);

    logKairosRuntimeEvent({
      mode,
      surface,
      department,
      status: 'error',
      errorCode: safeError.body.code,
      authorizationMode: authorization?.mode,
      subject: authorization?.session.sub,
      tenantId: authorization?.session.tenantId,
      role: authorization?.session.role,
      sessionId: authorization?.session.sessionId
    });

    res.status(safeError.statusCode).json(safeError.body);
  }
}
