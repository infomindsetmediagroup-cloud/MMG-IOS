import type { KairosRuntimeRequest } from './contracts.js';

export interface KairosRuntimeLogEvent {
  timestamp: string;
  mode: KairosRuntimeRequest['mode'];
  surface: KairosRuntimeRequest['surface'];
  department: string;
  status: 'ok' | 'error';
  errorCode?: string;
}

export function logKairosRuntimeEvent(event: Omit<KairosRuntimeLogEvent, 'timestamp'>): void {
  const payload: KairosRuntimeLogEvent = {
    timestamp: new Date().toISOString(),
    ...event
  };

  console.info('[kairos-runtime]', JSON.stringify(payload));
}
