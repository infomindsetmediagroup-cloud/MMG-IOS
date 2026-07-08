import { beforeEach, describe, expect, it } from 'vitest';
import type { KairosRuntimeRequest, KairosRuntimeResponse } from './contracts';
import {
  persistKairosAuditRecord,
  persistKairosResponseMessage,
  persistKairosUserMessage,
  resolveKairosConversation
} from './conversationLifecycle';
import { getKairosPersistenceStore, resetKairosPersistenceStoreForTests } from './persistence/store';
import type { KairosTrustedSession } from './session';

const publicSession: KairosTrustedSession = { role: 'public', source: 'anonymous' };
const customerSession: KairosTrustedSession = { role: 'customer', subject: 'customer-1', source: 'trusted-auth' };

const runtimeRequest: KairosRuntimeRequest = {
  mode: 'public',
  surface: 'website',
  message: 'Hello Kairos',
  context: {}
};

beforeEach(() => {
  resetKairosPersistenceStoreForTests();
});

describe('Kairos conversation lifecycle', () => {
  it('creates conversations for new runtime requests', () => {
    const conversation = resolveKairosConversation(runtimeRequest, publicSession);

    expect(conversation.conversationId).toBeDefined();
    expect(getKairosPersistenceStore().conversations.findById(conversation.conversationId)).toMatchObject({
      mode: 'public',
      surface: 'website'
    });
  });

  it('reuses authorized conversations', () => {
    const conversation = resolveKairosConversation({ ...runtimeRequest, mode: 'customer', surface: 'dashboard' }, customerSession);
    const resumed = resolveKairosConversation(
      { ...runtimeRequest, mode: 'customer', surface: 'dashboard', conversationId: conversation.conversationId },
      customerSession
    );

    expect(resumed.conversationId).toBe(conversation.conversationId);
  });

  it('rejects cross-owner conversation access', () => {
    const conversation = resolveKairosConversation({ ...runtimeRequest, mode: 'customer', surface: 'dashboard' }, customerSession);

    expect(() =>
      resolveKairosConversation(
        { ...runtimeRequest, mode: 'customer', surface: 'dashboard', conversationId: conversation.conversationId },
        { role: 'customer', subject: 'customer-2', source: 'trusted-auth' }
      )
    ).toThrow('Kairos conversation is not authorized for this session.');
  });

  it('persists user and Kairos response messages', () => {
    const conversation = resolveKairosConversation(runtimeRequest, publicSession);
    const runtimeResponse: KairosRuntimeResponse = {
      reply: 'Hello from Kairos.',
      mode: 'public',
      department: 'kairos-core',
      status: 'ok',
      conversationId: conversation.conversationId
    };

    persistKairosUserMessage(conversation.conversationId, runtimeRequest);
    persistKairosResponseMessage(conversation.conversationId, runtimeResponse);

    expect(getKairosPersistenceStore().messages.listByConversation(conversation.conversationId)).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello Kairos' }),
      expect.objectContaining({ role: 'kairos', content: 'Hello from Kairos.' })
    ]);
  });

  it('persists audit records with session ownership', () => {
    persistKairosAuditRecord({
      requestId: 'request-1',
      session: customerSession,
      event: 'kairos.runtime.request',
      status: 'ok',
      metadata: { mode: 'customer' }
    });

    expect(getKairosPersistenceStore().audit.list()).toEqual([
      expect.objectContaining({
        requestId: 'request-1',
        owner: { type: 'customer', subject: 'customer-1' },
        status: 'ok'
      })
    ]);
  });
});
