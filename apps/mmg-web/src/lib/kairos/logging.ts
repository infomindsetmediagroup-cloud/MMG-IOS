import type { KairosRuntimeRequest } from './contracts';

interface RuntimeLogEvent {
  requestId: string;
  timestamp: string;
  mode: KairosRuntimeRequest['mode'];
  surface: KairosRuntimeRequest['surface'];
  department: string;
  status: 'ok' | 'error';
  durationMs?: number;
  errorCode?: string;
}

export function logKairosRuntimeEvent(event: Omit<RuntimeLogEvent, 'timestamp'>): void {
  const payload: RuntimeLogEvent = {
    timestamp: new Date().toISOString(),
    ...event
  };

  console.info(JSON.stringify(payload));
}
