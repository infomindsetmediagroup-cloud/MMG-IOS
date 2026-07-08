import type { KairosRuntimeRequest, KairosRuntimeResponse } from './contracts';
import { ownerFromSession } from './persistence/models';
import { getKairosPersistenceStore } from './persistence/store';
import type { KairosTrustedSession } from './session';
import { runtimeError } from './validation';

export interface KairosConversationContext {
  conversationId: string;
}

export function resolveKairosConversation(runtimeRequest: KairosRuntimeRequest, session: KairosTrustedSession): KairosConversationContext {
  const store = getKairosPersistenceStore();
  const owner = ownerFromSession(session);

  if (runtimeRequest.conversationId) {
    const existing = store.conversations.findById(runtimeRequest.conversationId);
    if (!existing) {
      throw runtimeError('conversation_not_found', 'Kairos conversation was not found.', 404);
    }

    if (existing.owner.type !== owner.type || existing.owner.subject !== owner.subject) {
      throw runtimeError('conversation_not_authorized', 'Kairos conversation is not authorized for this session.', 403);
    }

    return { conversationId: existing.id };
  }

  const created = store.conversations.create({
    owner,
    mode: runtimeRequest.mode,
    surface: runtimeRequest.surface,
    title: runtimeRequest.message.slice(0, 80)
  });

  return { conversationId: created.id };
}

export function persistKairosUserMessage(conversationId: string, runtimeRequest: KairosRuntimeRequest): void {
  getKairosPersistenceStore().messages.append({
    conversationId,
    role: 'user',
    content: runtimeRequest.message,
    metadata: {
      mode: runtimeRequest.mode,
      surface: runtimeRequest.surface
    }
  });
}

export function persistKairosResponseMessage(conversationId: string, runtimeResponse: KairosRuntimeResponse): void {
  getKairosPersistenceStore().messages.append({
    conversationId,
    role: 'kairos',
    content: runtimeResponse.reply,
    metadata: {
      mode: runtimeResponse.mode,
      department: runtimeResponse.department
    }
  });
}

export function persistKairosAuditRecord(input: {
  requestId: string;
  session: KairosTrustedSession;
  event: string;
  status: 'ok' | 'error';
  metadata?: Record<string, string>;
}): void {
  getKairosPersistenceStore().audit.record({
    requestId: input.requestId,
    owner: ownerFromSession(input.session),
    event: input.event,
    status: input.status,
    metadata: input.metadata
  });
}
