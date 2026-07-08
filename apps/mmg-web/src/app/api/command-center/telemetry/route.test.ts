import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/command-center/telemetry', () => {
  it('returns command center telemetry through the route boundary', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.telemetry.source).toBe('development-adapter');
    expect(body.telemetry.parents).toHaveLength(5);
  });
});
