import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKairosEnvironmentStatus } from './environment';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getKairosEnvironmentStatus', () => {
  it('reports degraded when the runtime key is missing', () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    expect(getKairosEnvironmentStatus()).toMatchObject({
      status: 'degraded',
      runtimeConfigured: false
    });
  });

  it('reports ok when the runtime key is configured', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('KAIROS_OPENAI_MODEL', 'gpt-test');

    expect(getKairosEnvironmentStatus()).toMatchObject({
      status: 'ok',
      runtimeConfigured: true,
      model: 'gpt-test'
    });
  });

  it('defaults the Kairos model when none is configured', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('KAIROS_OPENAI_MODEL', '');

    expect(getKairosEnvironmentStatus().model).toBe('gpt-4.1-mini');
  });
});
