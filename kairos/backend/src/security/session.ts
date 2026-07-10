import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

const SESSION_COOKIE_NAME = 'mmg_kairos_session';
const DEFAULT_SESSION_TTL_SECONDS = 30 * 60;

type SessionRole = 'executive' | 'admin' | 'operator';

export interface KairosSessionClaims {
  sub: string;
  tenantId: string;
  role: SessionRole;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
}

interface SessionPayload {
  sub: string;
  tenantId: string;
  role: SessionRole;
  iat: number;
  exp: number;
  jti: string;
}

function getSigningSecret(): string {
  const secret = process.env.KAIROS_SESSION_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw Object.assign(new Error('Kairos session signing is not configured.'), {
      code: 'session_signing_unavailable',
      statusCode: 503
    });
  }
  return secret;
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyInternalGatewayToken(authorizationHeader?: string): void {
  const expected = process.env.KAIROS_GATEWAY_TOKEN?.trim();
  if (!expected) {
    throw Object.assign(new Error('Internal gateway authorization is not configured.'), {
      code: 'gateway_unavailable',
      statusCode: 503
    });
  }

  const supplied = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : '';

  if (!supplied || !secureEqual(supplied, expected)) {
    throw Object.assign(new Error('Internal gateway authorization failed.'), {
      code: 'unauthorized',
      statusCode: 401
    });
  }
}

export function issueKairosSession(input?: {
  subject?: string;
  tenantId?: string;
  role?: SessionRole;
  ttlSeconds?: number;
}): { token: string; claims: KairosSessionClaims } {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(300, Math.min(input?.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS, 8 * 60 * 60));
  const payload: SessionPayload = {
    sub: input?.subject ?? 'internal-executive',
    tenantId: input?.tenantId ?? 'mmg-internal',
    role: input?.role ?? 'executive',
    iat: now,
    exp: now + ttlSeconds,
    jti: randomUUID()
  };

  const encodedPayload = encode(JSON.stringify(payload));
  const signature = sign(encodedPayload, getSigningSecret());

  return {
    token: `${encodedPayload}.${signature}`,
    claims: {
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      sessionId: payload.jti
    }
  };
}

export function verifyKairosSession(token: string): KairosSessionClaims {
  const [encodedPayload, suppliedSignature, extra] = token.split('.');
  if (!encodedPayload || !suppliedSignature || extra) {
    throw Object.assign(new Error('Kairos session is malformed.'), {
      code: 'invalid_session',
      statusCode: 401
    });
  }

  const expectedSignature = sign(encodedPayload, getSigningSecret());
  if (!secureEqual(suppliedSignature, expectedSignature)) {
    throw Object.assign(new Error('Kairos session signature is invalid.'), {
      code: 'invalid_session',
      statusCode: 401
    });
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(decode(encodedPayload)) as SessionPayload;
  } catch {
    throw Object.assign(new Error('Kairos session payload is invalid.'), {
      code: 'invalid_session',
      statusCode: 401
    });
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || !payload.tenantId || !payload.role || !payload.jti || payload.exp <= now) {
    throw Object.assign(new Error('Kairos session has expired or is invalid.'), {
      code: 'expired_session',
      statusCode: 401
    });
  }

  return {
    sub: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    sessionId: payload.jti
  };
}

export function readKairosSession(req: Request): KairosSessionClaims | null {
  const cookieHeader = req.headers.cookie ?? '';
  const token = cookieHeader
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(`${SESSION_COOKIE_NAME}=`.length);

  if (!token) return null;
  return verifyKairosSession(decodeURIComponent(token));
}

export function writeKairosSessionCookie(res: Response, token: string, expiresAt: number): void {
  const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`
  ].join('; '));
}

export function clearKairosSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0'
  ].join('; '));
}
