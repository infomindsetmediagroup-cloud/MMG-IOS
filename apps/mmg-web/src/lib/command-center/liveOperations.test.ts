import { describe, expect, it } from 'vitest';
import { commandStateLabels, getDevelopmentCommandCenterTelemetry } from './liveOperations';

const expectedStates = [
  'queued',
  'initializing',
  'running',
  'processing',
  'waiting',
  'reviewing',
  'finalizing',
  'completed',
  'failed',
  'paused',
  'cancelled'
] as const;

describe('command center live operations telemetry', () => {
  it('exposes the shared processing state labels', () => {
    for (const state of expectedStates) {
      expect(commandStateLabels[state]).toBeTruthy();
    }
  });

  it('returns the five parent command collections from the development adapter', () => {
    const telemetry = getDevelopmentCommandCenterTelemetry();

    expect(telemetry.source).toBe('development-adapter');
    expect(telemetry.parents.map((parent) => parent.id)).toEqual([
      'executive',
      'knowledge',
      'publishing',
      'customers',
      'operations'
    ]);
  });

  it('keeps every parent collection backed by modules and events', () => {
    const telemetry = getDevelopmentCommandCenterTelemetry();

    for (const parent of telemetry.parents) {
      expect(parent.modules.length).toBeGreaterThan(0);
      expect(parent.events.length).toBeGreaterThan(0);
      expect(parent.health).toBeGreaterThanOrEqual(0);
      expect(parent.health).toBeLessThanOrEqual(100);
      expect(parent.progress).toBeGreaterThanOrEqual(0);
      expect(parent.progress).toBeLessThanOrEqual(100);
    }
  });

  it('surfaces release gate signals to executive, publishing, customer, and operations collections', () => {
    const telemetry = getDevelopmentCommandCenterTelemetry();
    const parentsWithReleaseSignals = telemetry.parents.filter((parent) => parent.releaseGateSignals?.length);

    expect(parentsWithReleaseSignals.map((parent) => parent.id)).toEqual([
      'executive',
      'publishing',
      'customers',
      'operations'
    ]);

    for (const parent of parentsWithReleaseSignals) {
      expect(parent.releaseGateSignals?.some((signal) => signal.status !== 'ready')).toBe(true);
      expect(parent.releaseGateSignals?.every((signal) => signal.requiredAction.length > 0)).toBe(true);
    }
  });
});
