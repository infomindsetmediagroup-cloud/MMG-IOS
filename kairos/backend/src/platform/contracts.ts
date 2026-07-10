export type PlatformRecordStatus = 'active' | 'archived';
export type WorkflowStatus = 'draft' | 'ready' | 'running' | 'blocked' | 'completed' | 'cancelled';
export type WorkflowStepStatus = 'pending' | 'ready' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled';
export type AuditOutcome = 'accepted' | 'rejected' | 'completed' | 'failed';
export type NotificationChannel = 'in_app' | 'email' | 'push';

export interface PlatformIdentityContext {
  subject: string;
  tenantId: string;
  role: string;
  sessionId: string;
}

export interface PlatformRecordMetadata {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  version: number;
  status: PlatformRecordStatus;
}

export interface WorkflowDefinition extends PlatformRecordMetadata {
  objectiveId: string;
  name: string;
  description: string;
  workflowStatus: WorkflowStatus;
  steps: WorkflowStepDefinition[];
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  capability: string;
  departmentId: string;
  dependsOn: string[];
  requiresApproval: boolean;
  status: WorkflowStepStatus;
}

export interface PlatformEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  tenantId: string;
  subject: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}

export interface KnowledgeRecord extends PlatformRecordMetadata {
  title: string;
  summary: string;
  sourceType: 'decision' | 'workflow' | 'research' | 'lesson' | 'policy' | 'asset';
  sourceId?: string;
  tags: string[];
  content: string;
}

export interface AssetRecord extends PlatformRecordMetadata {
  name: string;
  mediaType: string;
  storageKey: string;
  checksum?: string;
  projectId?: string;
  releaseStatus: 'internal' | 'approved_deliverable' | 'released';
}

export interface AuditRecord {
  id: string;
  occurredAt: string;
  tenantId: string;
  subject: string;
  role: string;
  sessionId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome: AuditOutcome;
  correlationId: string;
  details?: Record<string, unknown>;
}

export interface NotificationRecord extends PlatformRecordMetadata {
  recipientSubject: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  readAt?: string;
  relatedResourceType?: string;
  relatedResourceId?: string;
}
