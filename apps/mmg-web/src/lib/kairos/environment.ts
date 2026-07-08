export interface KairosEnvironmentStatus {
  status: 'ok' | 'degraded';
  environment: string;
  runtimeConfigured: boolean;
  model: string;
  checks: Array<{
    name: string;
    status: 'ok' | 'missing' | 'disabled';
    required: boolean;
  }>;
}

export function getKairosEnvironmentStatus(): KairosEnvironmentStatus {
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
  const model = process.env.KAIROS_OPENAI_MODEL ?? 'gpt-4.1-mini';
  const environment = process.env.NODE_ENV ?? 'development';

  const checks: KairosEnvironmentStatus['checks'] = [
    {
      name: 'OPENAI_API_KEY',
      status: hasOpenAiKey ? 'ok' : 'missing',
      required: true
    },
    {
      name: 'KAIROS_OPENAI_MODEL',
      status: process.env.KAIROS_OPENAI_MODEL ? 'ok' : 'disabled',
      required: false
    },
    {
      name: 'KAIROS_ENABLE_DEV_ROLE_HEADERS',
      status: process.env.KAIROS_ENABLE_DEV_ROLE_HEADERS === 'true' ? 'ok' : 'disabled',
      required: false
    }
  ];

  return {
    status: hasOpenAiKey ? 'ok' : 'degraded',
    environment,
    runtimeConfigured: hasOpenAiKey,
    model,
    checks
  };
}
