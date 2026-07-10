import type { Request } from 'express';
import {
  readKairosSession,
  verifyInternalGatewayToken,
  type KairosSessionClaims
} from './session.js';

export interface KairosAuthorizationContext {
  mode: 'session' | 'gateway-fallback';
  session: KairosSessionClaims;
}

function sessionEnforcementRequired(): boolean {
  return process.env.KAIROS_REQUIRE_SESSION?.trim().toLowerCase() === 'true';
}

export function authorizeKairosRequest(req: Request): KairosAuthorizationContext {
  const session = readKairosSession(req);
  if (session) {
    return { mode: 'session', session };
  }

  if (sessionEnforcementRequired()) {
    throw Object.assign(new Error('An authenticated Kairos application session is required.'), {
      code: 'session_required',
      statusCode: 401
    });
  }

  verifyInternalGatewayToken(req.headers.authorization);
  const now = Math.floor(Date.now() / 1000);
  return {
    mode: 'gateway-fallback',
    session: {
      sub: 'internal-executive',
      tenantId: 'mmg-internal',
      role: 'executive',
      issuedAt: now,
      expiresAt: now,
      sessionId: 'checkpoint-006-gateway-fallback'
    }
  };
}
