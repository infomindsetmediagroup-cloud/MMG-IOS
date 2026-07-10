import type { PlatformIdentityContext, WorkflowDefinition, WorkflowStepDefinition } from '../../platform/contracts.js';
import type { DesignProject } from './contracts.js';

function step(
  id: string,
  name: string,
  capability: string,
  departmentId: string,
  dependsOn: string[],
  requiresApproval = false
): WorkflowStepDefinition {
  return {
    id,
    name,
    capability,
    departmentId,
    dependsOn,
    requiresApproval,
    status: dependsOn.length === 0 ? 'ready' : 'pending'
  };
}

export function createDesignStudioWorkflow(
  project: DesignProject,
  identity: PlatformIdentityContext,
  workflowId: string
): WorkflowDefinition {
  if (project.tenantId !== identity.tenantId) {
    throw Object.assign(new Error('Design project tenant does not match the execution context.'), {
      code: 'cross_tenant_access',
      statusCode: 403
    });
  }

  const createdAt = new Date().toISOString();
  const steps: WorkflowStepDefinition[] = [
    step('intake', 'Validate design objective and production brief', 'design.intake.validate', 'design-studio', []),
    step('sources', 'Register source assets', 'design.assets.register', 'design-studio', ['intake']),
    step('production', 'Create and refine production assets', 'design.production.create', 'design-studio', ['sources']),
    step('review', 'Review production proof', 'design.production.review', 'design-studio', ['production']),
    step('approval', 'Approve designated deliverables', 'design.release.approve', 'executive-office', ['review'], true),
    step('handoff', 'Record governed deliverable handoff', 'design.release.record', 'design-studio', ['approval'], true)
  ];

  return {
    id: workflowId,
    tenantId: project.tenantId,
    createdAt,
    updatedAt: createdAt,
    createdBy: identity.subject,
    version: 1,
    status: 'active',
    objectiveId: project.objectiveId,
    name: `Design Studio workflow — ${project.name}`,
    description: 'Governed production workflow that keeps intermediate assets inside MMG/Kairos.',
    workflowStatus: 'draft',
    steps
  };
}
