import { describe, expect, it } from 'vitest';
import { parseKairosRuntimeRequest } from './validation';

describe('parseKairosRuntimeRequest', () => {
  it('normalizes valid requests', () => {
    expect(
      parseKairosRuntimeRequest({
        mode: 'public',
        surface: 'website',
        message: '  Hello Kairos  ',
        context: { department: 'knowledge' }
      })
    ).toEqual({
      mode: 'public',
      surface: 'website',
      message: 'Hello Kairos',
      context: { department: 'knowledge' },
      conversationId: undefined
    });
  });

  it('normalizes optional conversation IDs', () => {
    expect(
      parseKairosRuntimeRequest({
        mode: 'public',
        surface: 'website',
        message: 'Hello Kairos',
        conversationId: '  conversation-123  '
      })
    ).toMatchObject({ conversationId: 'conversation-123' });
  });

  it('rejects empty messages', () => {
    expect(() =>
      parseKairosRuntimeRequest({
        mode: 'public',
        surface: 'website',
        message: '   '
      })
    ).toThrow('Message cannot be empty.');
  });

  it('rejects unsupported modes', () => {
    expect(() =>
      parseKairosRuntimeRequest({
        mode: 'owner',
        surface: 'website',
        message: 'Hello'
      })
    ).toThrow('Request mode is not supported.');
  });
});
