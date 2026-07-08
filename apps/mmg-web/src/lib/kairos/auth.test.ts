import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeKairosRequest, resolveKairosSession } from './auth';
import type { KairosRuntimeRequest } from './contracts';

const baseRequest: KairosRuntimeRequest = {
  mode: 'public',
  surface: 'website',
  message: 'Hello',
  context: {}
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Kairos auth guard', () => {
  it('resolves anonymous public sessions by default', () => {
    expect(resolveKairosSession(new Headers())).toEqual({ role: 'public', source: 'anonymous' });
  });

  it('does not trust role headers unless dev override is explicitly enabled', () => {
    const headers = new Headers({
      'x-kairos-role': 'admin',
      'x-kairos-subject': 'local-admin'
    });

    expect(resolveKairosSession(headers)).toEqual({ role: 'public', source: 'anonymous' });
  });

  it('allows role headers only when the dev override flag is enabled outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('KAIROS_ENABLE_DEV_ROLE_HEADERS', 'true');

    const headers = new Headers({
      'x-kairos-role': 'admin',
      'x-kairos-subject': 'local-admin'
    });

    expect(resolveKairosSession(headers)).toEqual({ role: 'admin', subject: 'local-admin', source: 'development-override' });
  });

  it('does not allow role headers in production even when override flag is present', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KAIROS_ENABLE_DEV_ROLE_HEADERS', 'true');

    const headers = new Headers({
      'x-kairos-role': 'admin',
      'x-kairos-subject': 'prod-spoof'
    });

    expect(resolveKairosSession(headers)).toEqual({ role: 'public', source: 'anonymous' });
  });

  it('allows public mode without authenticated headers', () => {
    expect(() => authorizeKairosRequest(baseRequest, { role: 'public', source: 'anonymous' })).not.toThrow();
  });

  it('blocks customer mode for public sessions', () => {
    expect(() =>
      authorizeKairosRequest({ ...baseRequest, mode: 'customer' }, { role: 'public', source: 'anonymous' })
    ).toThrow('Requested Kairos mode is not authorized for this session.');
  });

  it('allows admin sessions to access admin mode after trusted session resolution', () => {
    expect(() =>
      authorizeKairosRequest({ ...baseRequest, mode: 'admin' }, { role: 'admin', source: 'trusted-auth' })
    ).not.toThrow();
  });
});
