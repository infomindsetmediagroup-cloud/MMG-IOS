import type { KairosRuntimeRequest } from './contracts';
import { runtimeError } from './validation';

export interface KairosSession {
  role: 'public' | 'customer' | 'admin';
  subject?: string;
}

export function resolveKairosSession(headers: Headers): KairosSession {
  if (!isDevelopmentRoleOverrideEnabled()) {
    return { role: 'public' };
  }

  const role = headers.get('x-kairos-role');
  const subject = headers.get('x-kairos-subject') ?? undefined;

  if (role === 'admin') {
    return { role: 'admin', subject };
  }

  if (role === 'customer') {
    return { role: 'customer', subject };
  }

  return { role: 'public' };
}

export function authorizeKairosRequest(request: KairosRuntimeRequest, session: KairosSession): void {
  if (request.mode === 'public') {
    return;
  }

  if (request.mode === 'customer' && (session.role === 'customer' || session.role === 'admin')) {
    return;
  }

  if (request.mode === 'admin' && session.role === 'admin') {
    return;
  }

  throw runtimeError('unauthorized_mode', 'Requested Kairos mode is not authorized for this session.', 403);
}

function isDevelopmentRoleOverrideEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.KAIROS_ENABLE_DEV_ROLE_HEADERS === 'true';
}
