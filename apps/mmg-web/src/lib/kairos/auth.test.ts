import { describe, expect, it } from 'vitest';
import { authorizeKairosRequest, resolveKairosSession } from './auth';
import type { KairosRuntimeRequest } from './contracts';

const baseRequest: KairosRuntimeRequest = {
  mode: 'public',
  surface: 'website',
  message: 'Hello',
  context: {}
};

describe('Kairos auth guard', () => {
  it('resolves public sessions by default', () => {
    expect(resolveKairosSession(new Headers())).toEqual({ role: 'public' });
  });

  it('allows public mode without authenticated headers', () => {
    expect(() => authorizeKairosRequest(baseRequest, { role: 'public' })).not.toThrow();
  });

  it('blocks customer mode for public sessions', () => {
    expect(() =>
      authorizeKairosRequest({ ...baseRequest, mode: 'customer' }, { role: 'public' })
    ).toThrow('Requested Kairos mode is not authorized for this session.');
  });

  it('allows admin sessions to access admin mode', () => {
    expect(() =>
      authorizeKairosRequest({ ...baseRequest, mode: 'admin' }, { role: 'admin' })
    ).not.toThrow();
  });
});
