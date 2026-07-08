import { runtimeError } from './validation';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const windowMs = 60_000;
const maxRequests = 30;
const buckets = new Map<string, RateLimitEntry>();

export function enforceKairosRateLimit(key: string): void {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count >= maxRequests) {
    throw runtimeError('rate_limited', 'Too many Kairos requests. Try again shortly.', 429);
  }

  existing.count += 1;
}

export function resolveRateLimitKey(headers: Headers): string {
  return (
    headers.get('x-kairos-subject') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous'
  );
}
