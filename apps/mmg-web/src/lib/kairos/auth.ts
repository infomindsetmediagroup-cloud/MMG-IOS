import type { KairosRuntimeRequest } from './contracts';
import { assertTrustedRole, createKairosSessionResolver, type KairosTrustedSession } from './session';

export interface KairosSession {
  role: KairosTrustedSession['role'];
  subject?: string;
  source: KairosTrustedSession['source'];
}

export function resolveKairosSession(headers: Headers): KairosSession {
  return createKairosSessionResolver().resolve(headers);
}

export function authorizeKairosRequest(request: KairosRuntimeRequest, session: KairosSession): void {
  if (request.mode === 'public') {
    return;
  }

  if (request.mode === 'customer') {
    assertTrustedRole(session, ['customer', 'admin']);
    return;
  }

  assertTrustedRole(session, ['admin']);
}
