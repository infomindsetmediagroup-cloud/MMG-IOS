import { describe, expect, it } from 'vitest';
import { enforceKairosRateLimit, resolveRateLimitKey } from './rateLimit';
import { withKairosTimeout } from './timeout';

describe('Kairos runtime guards', () => {
  it('resolves rate limit keys from headers', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.7, 10.0.0.1'
    });

    expect(resolveRateLimitKey(headers)).toBe('203.0.113.7');
  });

  it('allows requests within the in-memory rate limit', () => {
    expect(() => enforceKairosRateLimit(`test-${crypto.randomUUID()}`)).not.toThrow();
  });

  it('returns successful operations before timeout', async () => {
    await expect(withKairosTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
});
