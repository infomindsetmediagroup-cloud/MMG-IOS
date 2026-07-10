import type { PlatformEvent, PlatformIdentityContext } from '../../platform/contracts.js';
import type {
  PublishingApprovalRecord,
  PublishingFactEventPayload,
  PublishingProject,
  PublishingProjectStatus
} from './contracts.js';

const transitions: Record<PublishingProjectStatus, PublishingProjectStatus[]> = {
  intake: ['manuscript_development', 'cancelled'],
  manuscript_development: ['editorial_review', 'cancelled'],
  editorial_review: ['manuscript_development', 'design_and_formatting', 'cancelled'],
  design_and_formatting: ['production_review', 'cancelled'],
  production_review: ['design_and_formatting', 'executive_approval', 'cancelled'],
  executive_approval: ['production_review', 'release_ready', 'cancelled'],
  release_ready: ['executive_approval', 'released', 'cancelled'],
  released: [],
  cancelled: []
};

export interface PublishingTransitionResult {
  project: PublishingProject;
  event: PlatformEvent<PublishingFactEventPayload>;
}

export function transitionPublishingProject(input: {
  project: PublishingProject;
  identity: PlatformIdentityContext;
  nextStatus: PublishingProjectStatus;
  eventId: string;
  correlationId: string;
  approval?: PublishingApprovalRecord;
}): PublishingTransitionResult {
  const { project, identity, nextStatus, approval } = input;

  if (project.tenantId !== identity.tenantId) {
    throw Object.assign(new Error('Publishing project tenant does not match the execution context.'), {
      code: 'cross_tenant_access',
      statusCode: 403
    });
  }

  if (!transitions[project.status].includes(nextStatus)) {
    throw Object.assign(new Error(`Publishing transition ${project.status} -> ${nextStatus} is not allowed.`), {
      code: 'invalid_publishing_transition',
      statusCode: 409
    });
  }

  if (nextStatus === 'released') {
    const validReleaseApproval =
      approval &&
      approval.tenantId === project.tenantId &&
      approval.publishingProjectId === project.id &&
      approval.approvalType === 'release';

    if (!validReleaseApproval) {
      throw Object.assign(new Error('A valid tenant-scoped release approval is required before release.'), {
        code: 'release_approval_required',
        statusCode: 409
      });
    }
  }

  const occurredAt = new Date().toISOString();
  const updated: PublishingProject = {
    ...project,
    status: nextStatus,
    updatedAt: occurredAt,
    version: project.version + 1,
    approvalId: approval?.id ?? project.approvalId,
    releasedAt: nextStatus === 'released' ? occurredAt : project.releasedAt
  };

  return {
    project: updated,
    event: {
      id: input.eventId,
      type: 'publishing.project.status_changed',
      version: 1,
      occurredAt,
      tenantId: project.tenantId,
      subject: identity.subject,
      correlationId: input.correlationId,
      payload: {
        publishingProjectId: project.id,
        previousStatus: project.status,
        status: nextStatus,
        workflowId: project.workflowId,
        approvalId: updated.approvalId
      }
    }
  };
}
