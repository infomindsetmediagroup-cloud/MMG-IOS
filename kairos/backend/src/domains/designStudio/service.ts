import type { PlatformEvent, PlatformIdentityContext } from '../../platform/contracts.js';
import type { DesignAsset, DesignProject, DesignReleaseApproval, DesignProjectStatus } from './contracts.js';

const transitions: Record<DesignProjectStatus, DesignProjectStatus[]> = {
  draft: ['in_production', 'archived'],
  in_production: ['review_required', 'archived'],
  review_required: ['in_production', 'approved', 'archived'],
  approved: ['in_production', 'released', 'archived'],
  released: ['archived'],
  archived: []
};

export function assertAssetMayLeaveWorkspace(asset: DesignAsset, approval?: DesignReleaseApproval): void {
  const intermediate = asset.assetRole !== 'approved_deliverable';
  const approved =
    approval &&
    approval.tenantId === asset.tenantId &&
    approval.designProjectId === asset.designProjectId &&
    approval.assetIds.includes(asset.id);

  if (intermediate || !approved || asset.releaseStatus === 'internal') {
    throw Object.assign(new Error('Design Studio intermediate assets must remain inside the MMG/Kairos workspace.'), {
      code: 'design_asset_release_prohibited',
      statusCode: 409
    });
  }
}

export function transitionDesignProject(input: {
  project: DesignProject;
  identity: PlatformIdentityContext;
  nextStatus: DesignProjectStatus;
  eventId: string;
  correlationId: string;
  approval?: DesignReleaseApproval;
}): { project: DesignProject; event: PlatformEvent } {
  const { project, identity, nextStatus, approval } = input;
  if (project.tenantId !== identity.tenantId) {
    throw Object.assign(new Error('Design project tenant does not match the execution context.'), {
      code: 'cross_tenant_access',
      statusCode: 403
    });
  }
  if (!transitions[project.projectStatus].includes(nextStatus)) {
    throw Object.assign(new Error(`Design transition ${project.projectStatus} -> ${nextStatus} is not allowed.`), {
      code: 'invalid_design_transition',
      statusCode: 409
    });
  }
  if (nextStatus === 'released') {
    const valid = approval && approval.tenantId === project.tenantId && approval.designProjectId === project.id;
    if (!valid || project.approvedDeliverableAssetIds.length === 0) {
      throw Object.assign(new Error('A tenant-scoped approval and at least one approved deliverable are required.'), {
        code: 'design_release_approval_required',
        statusCode: 409
      });
    }
  }
  const occurredAt = new Date().toISOString();
  const updated: DesignProject = {
    ...project,
    projectStatus: nextStatus,
    updatedAt: occurredAt,
    version: project.version + 1
  };
  return {
    project: updated,
    event: {
      id: input.eventId,
      type: 'design.project.status_changed',
      version: 1,
      occurredAt,
      tenantId: project.tenantId,
      subject: identity.subject,
      correlationId: input.correlationId,
      payload: {
        designProjectId: project.id,
        previousStatus: project.projectStatus,
        status: nextStatus,
        publishingProjectId: project.publishingProjectId,
        approvalId: approval?.id
      }
    }
  };
}
