import type { PlatformIdentityContext, WorkflowDefinition, WorkflowStepDefinition } from '../../platform/contracts.js';
import type { PublishingProject } from './contracts.js';

function nowISO(): string {
  return new Date().toISOString();
}

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

export function createPublishingWorkflow(
  project: PublishingProject,
  identity: PlatformIdentityContext,
  workflowId: string
): WorkflowDefinition {
  if (project.tenantId !== identity.tenantId) {
    throw Object.assign(new Error('Publishing project tenant does not match the execution context.'), {
      code: 'cross_tenant_access',
      statusCode: 403
    });
  }

  const createdAt = nowISO();
  const steps: WorkflowStepDefinition[] = [
    step('intake', 'Validate project intake', 'publishing.intake.validate', 'publishing', []),
    step('manuscript', 'Develop manuscript', 'publishing.manuscript.develop', 'publishing', ['intake']),
    step('editorial', 'Complete editorial review', 'publishing.editorial.review', 'publishing', ['manuscript']),
    step('design', 'Create cover and interior production assets', 'design.production.create', 'design-studio', ['editorial']),
    step('proof', 'Review production proof', 'publishing.production.review', 'publishing', ['design']),
    step('approval', 'Obtain executive release approval', 'publishing.release.approve', 'executive-office', ['proof'], true),
    step('release-ready', 'Prepare approved deliverables', 'publishing.release.prepare', 'publishing', ['approval']),
    step('release', 'Record governed release completion', 'publishing.release.record', 'publishing', ['release-ready'], true)
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
    name: `Publishing workflow — ${project.title}`,
    description: 'Governed publishing lifecycle from intake through approved release.',
    workflowStatus: 'draft',
    steps
  };
}
