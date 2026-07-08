import type { KairosRuntimeRequest } from '../contracts';
import type { KairosTrustedSession } from '../session';

export type KairosRecordOwnerType = 'anonymous' | 'customer' | 'admin';
export type KairosMessageRole = 'user' | 'kairos' | 'system';
export type KairosWorkOrderStatus = 'draft' | 'awaiting_approval' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled';
export type KairosKnowledgeEventStatus = 'candidate' | 'in_review' | 'approved' | 'rejected';
export type KairosKnowledgeEventCategory =
  | 'customer_insight'
  | 'documentation_improvement'
  | 'product_improvement'
  | 'workflow_improvement'
  | 'educational_opportunity'
  | 'knowledge_gap'
  | 'support_trend'
  | 'operational_intelligence';

export interface KairosRecordOwner {
  type: KairosRecordOwnerType;
  subject?: string;
}

export interface KairosBaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface KairosConversationRecord extends KairosBaseRecord {
  owner: KairosRecordOwner;
  surface: KairosRuntimeRequest['surface'];
  mode: KairosRuntimeRequest['mode'];
  title?: string;
}

export interface KairosMessageRecord extends KairosBaseRecord {
  conversationId: string;
  role: KairosMessageRole;
  content: string;
  metadata?: Record<string, string>;
}

export interface KairosAuditRecord extends KairosBaseRecord {
  requestId: string;
  owner: KairosRecordOwner;
  event: string;
  status: 'ok' | 'error';
  metadata?: Record<string, string>;
}

export interface KairosWorkOrderRecord extends KairosBaseRecord {
  owner: KairosRecordOwner;
  sourceConversationId?: string;
  request: string;
  executionPlan: string;
  status: KairosWorkOrderStatus;
  approvedAt?: string;
  completedAt?: string;
  finalDeliverable?: string;
}

export interface KairosKnowledgeEventRecord extends KairosBaseRecord {
  owner: KairosRecordOwner;
  sourceConversationId?: string;
  category: KairosKnowledgeEventCategory;
  status: KairosKnowledgeEventStatus;
  summary: string;
  evidence: string;
}

export function ownerFromSession(session: KairosTrustedSession): KairosRecordOwner {
  if (session.role === 'admin') {
    return { type: 'admin', subject: session.subject };
  }

  if (session.role === 'customer') {
    return { type: 'customer', subject: session.subject };
  }

  return { type: 'anonymous', subject: session.subject };
}
