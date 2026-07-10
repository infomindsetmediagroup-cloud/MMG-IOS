import type { KairosMode, KairosSurface } from '../runtime/contracts.js';

export type KairosDepartmentId =
  | 'executive-office'
  | 'publishing'
  | 'marketing'
  | 'design-studio'
  | 'knowledge'
  | 'customer-success'
  | 'engineering'
  | 'security'
  | 'commerce'
  | 'analytics';

export type KairosCommandType = 'analyze' | 'plan' | 'prepare' | 'review' | 'execute';

export interface KairosObjectiveInput {
  objective: string;
  mode: KairosMode;
  surface: KairosSurface;
  context?: Record<string, string>;
}

export interface KairosExecutionContext {
  requestId: string;
  auditId: string;
  subject: string;
  tenantId: string;
  role: string;
  sessionId: string;
  mode: KairosMode;
  surface: KairosSurface;
}

export interface KairosDepartmentDefinition {
  id: KairosDepartmentId;
  name: string;
  capabilities: readonly string[];
  keywords: readonly string[];
  requiresApprovalForExecution: boolean;
}

export interface KairosRouteDecision {
  primaryDepartment: KairosDepartmentId;
  supportingDepartments: KairosDepartmentId[];
  confidence: number;
  rationale: string;
  matchedCapabilities: string[];
  registryVersion: string;
}

export interface KairosPlanStep {
  id: string;
  title: string;
  commandType: KairosCommandType;
  department: KairosDepartmentId;
  dependsOn: string[];
  requiresApproval: boolean;
  completionCriteria: string[];
}

export interface KairosExecutionPlan {
  objective: string;
  route: KairosRouteDecision;
  steps: KairosPlanStep[];
  risks: string[];
  approvalsRequired: string[];
  completionCriteria: string[];
  sideEffectsAllowed: false;
}

export interface KairosFactEvent {
  type: string;
  occurredAt: string;
  requestId: string;
  auditId: string;
  actor: string;
  tenantId: string;
  data: Record<string, string | number | boolean | null>;
}
