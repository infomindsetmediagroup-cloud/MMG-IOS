import { runtimeError } from './validation';

export type KairosSessionRole = 'public' | 'customer' | 'admin';

export interface KairosTrustedSession {
  role: KairosSessionRole;
  subject?: string;
  source: 'anonymous' | 'development-override' | 'trusted-auth';
}

export interface KairosSessionResolver {
  resolve(headers: Headers): Promise<KairosTrustedSession> | KairosTrustedSession;
}

const anonymousSession: KairosTrustedSession = {
  role: 'public',
  source: 'anonymous'
};

export function createKairosSessionResolver(): KairosSessionResolver {
  return {
    resolve(headers: Headers): KairosTrustedSession {
      const trustedSession = resolveTrustedAuthSession(headers);
      if (trustedSession) {
        return trustedSession;
      }

      const developmentSession = resolveDevelopmentOverrideSession(headers);
      if (developmentSession) {
        return developmentSession;
      }

      return anonymousSession;
    }
  };
}

function resolveTrustedAuthSession(_headers: Headers): KairosTrustedSession | null {
  // Production authentication is intentionally not implemented in the foundation scaffold.
  // This seam is where the selected auth provider must validate a signed session or token.
  return null;
}

function resolveDevelopmentOverrideSession(headers: Headers): KairosTrustedSession | null {
  if (!isDevelopmentRoleOverrideEnabled()) {
    return null;
  }

  const role = headers.get('x-kairos-role');
  const subject = headers.get('x-kairos-subject') ?? undefined;

  if (role === 'admin') {
    return { role: 'admin', subject, source: 'development-override' };
  }

  if (role === 'customer') {
    return { role: 'customer', subject, source: 'development-override' };
  }

  return null;
}

export function assertTrustedRole(session: KairosTrustedSession, allowedRoles: KairosSessionRole[]): void {
  if (!allowedRoles.includes(session.role)) {
    throw runtimeError('unauthorized_mode', 'Requested Kairos mode is not authorized for this session.', 403);
  }
}

function isDevelopmentRoleOverrideEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.KAIROS_ENABLE_DEV_ROLE_HEADERS === 'true';
}
