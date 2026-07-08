import { runtimeError } from '../validation';
import type {
  KairosAuditRecord,
  KairosBaseRecord,
  KairosConversationRecord,
  KairosKnowledgeEventRecord,
  KairosMessageRecord,
  KairosRecordOwner,
  KairosWorkOrderRecord
} from './models';
import type { KairosPersistenceStore } from './repositories';

function now(): string {
  return new Date().toISOString();
}

function createBaseRecord(): KairosBaseRecord {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function sameOwner(left: KairosRecordOwner, right: KairosRecordOwner): boolean {
  return left.type === right.type && left.subject === right.subject;
}

export function createInMemoryKairosPersistenceStore(): KairosPersistenceStore {
  const conversations = new Map<string, KairosConversationRecord>();
  const messages = new Map<string, KairosMessageRecord>();
  const auditRecords = new Map<string, KairosAuditRecord>();
  const workOrders = new Map<string, KairosWorkOrderRecord>();
  const knowledgeEvents = new Map<string, KairosKnowledgeEventRecord>();

  return {
    conversations: {
      create(record) {
        const created = { ...createBaseRecord(), ...record } satisfies KairosConversationRecord;
        conversations.set(created.id, created);
        return created;
      },
      findById(id) {
        return conversations.get(id) ?? null;
      },
      listByOwner(owner) {
        return Array.from(conversations.values()).filter((conversation) => sameOwner(conversation.owner, owner));
      }
    },
    messages: {
      append(record) {
        const created = { ...createBaseRecord(), ...record } satisfies KairosMessageRecord;
        messages.set(created.id, created);
        return created;
      },
      listByConversation(conversationId) {
        return Array.from(messages.values()).filter((message) => message.conversationId === conversationId);
      }
    },
    audit: {
      record(record) {
        const created = { ...createBaseRecord(), ...record } satisfies KairosAuditRecord;
        auditRecords.set(created.id, created);
        return created;
      },
      list(limit = 100) {
        return Array.from(auditRecords.values()).slice(-limit).reverse();
      }
    },
    workOrders: {
      create(record) {
        const created = { ...createBaseRecord(), ...record } satisfies KairosWorkOrderRecord;
        workOrders.set(created.id, created);
        return created;
      },
      findById(id) {
        return workOrders.get(id) ?? null;
      },
      update(id, patch) {
        const existing = workOrders.get(id);
        if (!existing) {
          throw runtimeError('work_order_not_found', 'Kairos work order was not found.', 404);
        }

        const updated = {
          ...existing,
          ...patch,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: now()
        } satisfies KairosWorkOrderRecord;
        workOrders.set(id, updated);
        return updated;
      }
    },
    knowledgeEvents: {
      create(record) {
        const created = { ...createBaseRecord(), ...record } satisfies KairosKnowledgeEventRecord;
        knowledgeEvents.set(created.id, created);
        return created;
      },
      listByStatus(status) {
        return Array.from(knowledgeEvents.values()).filter((event) => event.status === status);
      }
    }
  };
}
