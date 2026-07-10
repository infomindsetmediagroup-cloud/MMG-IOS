import { randomUUID } from 'node:crypto';
import type {
  PlatformIdentityContext,
  WorkflowDefinition,
  WorkflowStatus
} from './contracts.js';
import type { PlatformEventBus } from './eventBus.js';
import type { PlatformRepository } from './repository.js';

const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  draft: ['ready', 'cancelled'],
  ready: ['running', 'cancelled'],
  running: ['blocked', 'completed', 'cancelled'],
  blocked: ['running', 'cancelled'],
  completed: [],
  cancelled: []
};

export interface CreateWorkflowInput {
  objectiveId: string;
  name: string;
  description: string;
  steps: WorkflowDefinition['steps'];
}

export class WorkflowLifecycleService {
  constructor(
    private readonly repository: PlatformRepository<WorkflowDefinition>,
    private readonly eventBus: PlatformEventBus
  ) {}

  async create(input: CreateWorkflowInput, identity: PlatformIdentityContext): Promise<WorkflowDefinition> {
    const now = new Date().toISOString();
    const workflow: WorkflowDefinition = {
      id: randomUUID(),
      tenantId: identity.tenantId,
      createdAt: now,
      updatedAt: now,
      createdBy: identity.subject,
      version: 1,
      status: 'active',
      objectiveId: input.objectiveId,
      name: input.name.trim(),
      description: input.description.trim(),
      workflowStatus: 'draft',
      steps: input.steps.map(step => ({
        ...step,
        dependsOn: [...step.dependsOn],
        status: 'pending'
      }))
    };

    this.validateWorkflow(workflow);
    await this.repository.save(workflow);
    await this.eventBus.publish({
      type: 'workflow.created',
      tenantId: identity.tenantId,
      subject: identity.subject,
      correlationId: workflow.objectiveId,
      payload: { workflowId: workflow.id, objectiveId: workflow.objectiveId }
    });
    return workflow;
  }

  async transition(
    tenantId: string,
    workflowId: string,
    nextStatus: WorkflowStatus,
    identity: PlatformIdentityContext
  ): Promise<WorkflowDefinition> {
    if (identity.tenantId !== tenantId) {
      throw Object.assign(new Error('Cross-tenant workflow access is forbidden.'), {
        code: 'tenant_mismatch',
        statusCode: 403
      });
    }

    const workflow = await this.repository.get(tenantId, workflowId);
    if (!workflow) {
      throw Object.assign(new Error('Workflow was not found.'), {
        code: 'workflow_not_found',
        statusCode: 404
      });
    }

    if (!ALLOWED_TRANSITIONS[workflow.workflowStatus].includes(nextStatus)) {
      throw Object.assign(new Error(`Workflow cannot transition from ${workflow.workflowStatus} to ${nextStatus}.`), {
        code: 'invalid_workflow_transition',
        statusCode: 409
      });
    }

    const updated: WorkflowDefinition = {
      ...workflow,
      workflowStatus: nextStatus,
      updatedAt: new Date().toISOString(),
      version: workflow.version + 1
    };

    await this.repository.save(updated);
    await this.eventBus.publish({
      type: 'workflow.status_changed',
      tenantId,
      subject: identity.subject,
      correlationId: workflow.objectiveId,
      causationId: workflow.id,
      payload: {
        workflowId,
        previousStatus: workflow.workflowStatus,
        nextStatus
      }
    });
    return updated;
  }

  private validateWorkflow(workflow: WorkflowDefinition): void {
    if (!workflow.name || !workflow.objectiveId) {
      throw Object.assign(new Error('Workflow name and objective ID are required.'), {
        code: 'invalid_workflow',
        statusCode: 400
      });
    }

    const stepIds = new Set(workflow.steps.map(step => step.id));
    if (stepIds.size !== workflow.steps.length) {
      throw Object.assign(new Error('Workflow step IDs must be unique.'), {
        code: 'duplicate_workflow_step',
        statusCode: 400
      });
    }

    for (const step of workflow.steps) {
      if (step.dependsOn.includes(step.id) || step.dependsOn.some(id => !stepIds.has(id))) {
        throw Object.assign(new Error(`Workflow step ${step.id} has an invalid dependency.`), {
          code: 'invalid_workflow_dependency',
          statusCode: 400
        });
      }
    }
  }
}
