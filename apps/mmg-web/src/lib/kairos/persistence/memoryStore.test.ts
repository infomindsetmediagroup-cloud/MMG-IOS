import { describe, expect, it } from 'vitest';
import { createInMemoryKairosPersistenceStore } from './memoryStore';
import type { KairosRecordOwner } from './models';

const customerOwner: KairosRecordOwner = { type: 'customer', subject: 'customer-1' };
const otherOwner: KairosRecordOwner = { type: 'customer', subject: 'customer-2' };

describe('createInMemoryKairosPersistenceStore', () => {
  it('creates and isolates conversations by owner', () => {
    const store = createInMemoryKairosPersistenceStore();

    const conversation = store.conversations.create({
      owner: customerOwner,
      mode: 'customer',
      surface: 'dashboard',
      title: 'Customer project'
    });

    store.conversations.create({
      owner: otherOwner,
      mode: 'customer',
      surface: 'dashboard',
      title: 'Other project'
    });

    expect(store.conversations.findById(conversation.id)).toEqual(conversation);
    expect(store.conversations.listByOwner(customerOwner)).toEqual([conversation]);
  });

  it('appends messages to conversations', () => {
    const store = createInMemoryKairosPersistenceStore();
    const conversation = store.conversations.create({ owner: customerOwner, mode: 'customer', surface: 'dashboard' });

    const message = store.messages.append({
      conversationId: conversation.id,
      role: 'user',
      content: 'Build the next workflow.'
    });

    expect(store.messages.listByConversation(conversation.id)).toEqual([message]);
  });

  it('updates work orders with lifecycle status changes', () => {
    const store = createInMemoryKairosPersistenceStore();
    const workOrder = store.workOrders.create({
      owner: customerOwner,
      request: 'Create execution plan',
      executionPlan: 'Prepare plan and wait for approval.',
      status: 'awaiting_approval'
    });

    const updated = store.workOrders.update(workOrder.id, { status: 'approved', approvedAt: '2026-07-08T00:00:00.000Z' });

    expect(updated.status).toBe('approved');
    expect(updated.createdAt).toBe(workOrder.createdAt);
    expect(updated.updatedAt).not.toBe(workOrder.updatedAt);
  });

  it('lists knowledge event candidates by status', () => {
    const store = createInMemoryKairosPersistenceStore();
    const event = store.knowledgeEvents.create({
      owner: customerOwner,
      category: 'knowledge_gap',
      status: 'candidate',
      summary: 'Users ask for publishing guidance.',
      evidence: 'Conversation transcript summary.'
    });

    expect(store.knowledgeEvents.listByStatus('candidate')).toEqual([event]);
  });
});
