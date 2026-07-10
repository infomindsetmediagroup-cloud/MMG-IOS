import type { Request, Response } from 'express';
import { toSafeErrorResponse } from '../runtime/errors.js';
import {
  clearKairosSessionCookie,
  issueKairosSession,
  readKairosSession,
  verifyInternalGatewayToken,
  writeKairosSessionCookie
} from '../security/session.js';

export function handleSessionExchange(req: Request, res: Response): void {
  try {
    verifyInternalGatewayToken(req.headers.authorization);
    const { token, claims } = issueKairosSession();
    writeKairosSessionCookie(res, token, claims.expiresAt);

    res.status(201).json({
      status: 'authenticated',
      session: claims
    });
  } catch (error) {
    const safeError = toSafeErrorResponse(error);
    res.status(safeError.statusCode).json(safeError.body);
  }
}

export function handleSessionStatus(req: Request, res: Response): void {
  try {
    const session = readKairosSession(req);
    if (!session) {
      res.status(401).json({
        status: 'unauthenticated',
        code: 'session_required',
        message: 'An authenticated Kairos application session is required.'
      });
      return;
    }

    res.status(200).json({
      status: 'authenticated',
      session
    });
  } catch (error) {
    const safeError = toSafeErrorResponse(error);
    res.status(safeError.statusCode).json(safeError.body);
  }
}

export function handleSessionLogout(_req: Request, res: Response): void {
  clearKairosSessionCookie(res);
  res.status(204).end();
}
