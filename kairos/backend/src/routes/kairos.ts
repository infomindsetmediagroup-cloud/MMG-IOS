import type { Request, Response } from 'express';
import { toSafeErrorResponse } from '../runtime/errors.js';
import { logKairosRuntimeEvent } from '../runtime/logging.js';
import { runKairosCore } from '../runtime/openaiClient.js';
import { parseKairosRuntimeRequest } from '../runtime/validation.js';

export async function handleKairosRequest(req: Request, res: Response): Promise<void> {
  let mode = 'public' as const;
  let surface = 'website' as const;
  const department = 'kairos-core';

  try {
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
      status: 'ok'
    });

    res.status(200).json(runtimeResponse);
  } catch (error) {
    const safeError = toSafeErrorResponse(error);

    logKairosRuntimeEvent({
      mode,
      surface,
      department,
      status: 'error',
      errorCode: safeError.body.code
    });

    res.status(safeError.statusCode).json(safeError.body);
  }
}
