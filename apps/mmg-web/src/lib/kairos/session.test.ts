import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertTrustedRole, createKairosSessionResolver } from './session';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Kairos session resolver', () => {
  it('defaults to anonymous public sessions', () => {
    expect(createKairosSessionResolver().resolve(new Headers())).toEqual({ role: 'public', source: 'anonymous' });
  });

  it('allows local development overrides only when explicitly enabled', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('KAIROS_ENABLE_DEV_ROLE_HEADERS', 'true');

    const session = createKairosSessionResolver().resolve(
      new Headers({
        'x-kairos-role': 'customer',
        'x-kairos-subject': 'customer-123'
      })
    );

    expect(session).toEqual({ role: 'customer', subject: 'customer-123', source: 'development-override' });
  });

  it('blocks production role-header escalation', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAIROS_ENABLE_DEV_ROLE_HEADERS', 'true');

    const session = createKairosSessionResolver().resolve(
      new Headers({
        'x-kairos-role': 'admin',
        'x-kairos-subject': 'spoof'
      })
    );

    expect(session).toEqual({ role: 'public', source: 'anonymous' });
  });

  it('throws when a session does not match required roles', () => {
    expect(() => assertTrustedRole({ role: 'public', source: 'anonymous' }, ['admin'])).toThrow(
      'Requested Kairos mode is not authorized for this session.'
    );
  });
});
