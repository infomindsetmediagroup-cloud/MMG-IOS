import type { KairosRuntimeRequest } from './contracts';

export interface KairosAuditEvent {
  requestId: string;
  timestamp: string;
  mode: KairosRuntimeRequest['mode'];
  surface: KairosRuntimeRequest['surface'];
  department: string;
  status: 'ok' | 'error';
  durationMs: number;
  errorCode?: string;
}

const auditBuffer: KairosAuditEvent[] = [];
const maxAuditEvents = 200;

export function recordKairosAuditEvent(event: Omit<KairosAuditEvent, 'timestamp'>): void {
  auditBuffer.unshift({
    timestamp: new Date().toISOString(),
    ...event
  });

  if (auditBuffer.length > maxAuditEvents) {
    auditBuffer.length = maxAuditEvents;
  }
}

export function readKairosAuditEvents(): KairosAuditEvent[] {
  return [...auditBuffer];
}
