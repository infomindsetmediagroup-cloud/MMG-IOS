import type {
  KairosAuditRecord,
  KairosConversationRecord,
  KairosKnowledgeEventRecord,
  KairosMessageRecord,
  KairosRecordOwner,
  KairosWorkOrderRecord
} from './models';

export type KairosCreateRecord<T extends { id: string; createdAt: string; updatedAt: string }> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

export interface KairosConversationRepository {
  create(record: KairosCreateRecord<KairosConversationRecord>): KairosConversationRecord;
  findById(id: string): KairosConversationRecord | null;
  listByOwner(owner: KairosRecordOwner): KairosConversationRecord[];
}

export interface KairosMessageRepository {
  append(record: KairosCreateRecord<KairosMessageRecord>): KairosMessageRecord;
  listByConversation(conversationId: string): KairosMessageRecord[];
}

export interface KairosAuditRepository {
  record(record: KairosCreateRecord<KairosAuditRecord>): KairosAuditRecord;
  list(limit?: number): KairosAuditRecord[];
}

export interface KairosWorkOrderRepository {
  create(record: KairosCreateRecord<KairosWorkOrderRecord>): KairosWorkOrderRecord;
  findById(id: string): KairosWorkOrderRecord | null;
  update(id: string, patch: Partial<KairosCreateRecord<KairosWorkOrderRecord>>): KairosWorkOrderRecord;
}

export interface KairosKnowledgeEventRepository {
  create(record: KairosCreateRecord<KairosKnowledgeEventRecord>): KairosKnowledgeEventRecord;
  listByStatus(status: KairosKnowledgeEventRecord['status']): KairosKnowledgeEventRecord[];
}

export interface KairosPersistenceStore {
  conversations: KairosConversationRepository;
  messages: KairosMessageRepository;
  audit: KairosAuditRepository;
  workOrders: KairosWorkOrderRepository;
  knowledgeEvents: KairosKnowledgeEventRepository;
}
