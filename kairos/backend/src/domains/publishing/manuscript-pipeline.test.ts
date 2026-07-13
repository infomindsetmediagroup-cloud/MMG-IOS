import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginManuscriptPipeline,
  completeKdpReadinessReview,
  decideManuscriptRevision,
  proposeManuscriptRevision,
  recordEditorialAnalysis,
  transitionManuscriptPipeline
} from './manuscript-pipeline.js';

const identity = { subject: 'customer-1', tenantId: 'tenant-1', role: 'customer', sessionId: 'session-1' };
const project = {
  id: 'project-1', tenantId: 'tenant-1', createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z',
  createdBy: 'customer-1', version: 1, status: 'intake', objectiveId: 'objective-1', title: 'Book', authorSubject: 'customer-1'
} as const;
const upload = {
  tenantId: 'tenant-1', publishingProjectId: 'project-1', filename: 'book.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 1024,
  checksumSha256: 'a'.repeat(64), sourceAssetId: 'asset-source-1'
};

test('requires customer approval before KDP readiness', () => {
  let pipeline = beginManuscriptPipeline({ project, upload, identity, pipelineId: 'pipeline-1' });
  pipeline = transitionManuscriptPipeline({ pipeline, identity, nextStage: 'validated' });
  pipeline = transitionManuscriptPipeline({ pipeline, identity, nextStage: 'text_extracted' });
  pipeline = transitionManuscriptPipeline({ pipeline, identity, nextStage: 'editorial_analysis' });
  pipeline = recordEditorialAnalysis({ pipeline, identity, issues: [{ id: 'i1', category: 'grammar', severity: 'warning', message: 'Issue', recommendation: 'Fix' }] });
  pipeline = proposeManuscriptRevision({ pipeline, identity, proposalId: 'proposal-1', proposedAssetId: 'asset-edited-1', summary: 'Editorial corrections' });
  pipeline = transitionManuscriptPipeline({ pipeline, identity, nextStage: 'customer_review' });
  pipeline = decideManuscriptRevision({ pipeline, identity, decision: 'approved' });
  assert.equal(pipeline.stage, 'revision_approved');
  assert.equal(pipeline.currentAssetId, 'asset-edited-1');
  assert.equal(pipeline.revision, 2);
});

test('blocking KDP issue returns manuscript for revision', () => {
  let pipeline = beginManuscriptPipeline({ project, upload, identity, pipelineId: 'pipeline-2' });
  pipeline = { ...pipeline, stage: 'kdp_readiness_review', revision: 2 };
  pipeline = completeKdpReadinessReview({
    pipeline,
    identity,
    reportId: 'report-1',
    profile: {
      edition: 'paperback', language: 'en-US', bleed: false, requireTableOfContents: true,
      requireEmbeddedFonts: true, minimumImageDpi: 300, sourceRevision: 'kdp-profile-2026-07', reviewedAt: '2026-07-12T00:00:00.000Z'
    },
    issues: [{ id: 'k1', category: 'kdp_readiness', severity: 'blocking', message: 'Missing required front matter.', recommendation: 'Add required front matter.' }]
  });
  assert.equal(pipeline.stage, 'revision_proposed');
  assert.equal(pipeline.readinessReport?.status, 'blocked');
});

test('rejects cross-tenant execution', () => {
  assert.throws(() => beginManuscriptPipeline({ project, upload, identity: { ...identity, tenantId: 'tenant-2' }, pipelineId: 'pipeline-3' }), /Tenant/);
});
