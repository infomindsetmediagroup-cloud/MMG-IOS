import type {
  KairosAuditRecord,
  KairosConversationRecord,
  KairosKnowledgeEventRecord,
  KairosMessageRecord,
  KairosRecordOwner,
  KairosWorkOrderRecord
} from './models';

export interface KairosConversationRepository {
  create(record: Omit<KairosConversationRecord, 'id' | 'createdAt' | 'updatedAt'>): KairosConversationRecord;
  findById(id: string): KairosConversationRecord | null;
  listByOwner(owner: KairosRecordOwner): KairosConversationRecord[];
}

export interface KairosMessageRepository {
  append(record: Omit<KairosMessageRecord, 'id' | 'createdAt' | 'updatedAt'>): KairosMessageRecord;
  listByConversation(conversationId: string): KairosMessageRecord[];
}

export interface KairosAuditRepository {
  record(record: Omit<KairosAuditRecord, 'id' | 'createdAt' | 'updatedAt'>): KairosAuditRecord;
  list(limit?: number): KairosAuditRecord[];
}

export interface KairosWorkOrderRepository {
  create(record: Omit<KairosWorkOrderRecord, 'id' | 'createdAt' | 'updatedAt'>): KairosWorkOrderRecord;
  findById(id: string): KairosWorkOrderRecord | null;
  update(id: string, patch: Partial<Omit<KairosWorkOrderRecord, 'id' | 'createdAt'>>): KairosWorkOrderRecord;
}

export interface KairosKnowledgeEventRepository {
  create(record: Omit<KairosKnowledgeEventRecord, 'id' | 'createdAt' | 'updatedAt'>): KairosKnowledgeEventRecord;
  listByStatus(status: KairosKnowledgeEventRecord['status']): KairosKnowledgeEventRecord[];
}

export interface KairosPersistenceStore {
  conversations: KairosConversationRepository;
  messages: KairosMessageRepository;
  audit: KairosAuditRepository;
  workOrders: KairosWorkOrderRepository;
  knowledgeEvents: KairosKnowledgeEventRepository;
}
