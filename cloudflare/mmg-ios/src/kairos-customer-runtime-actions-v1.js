import { transitionKairosRuntimeProject } from "./kairos-runtime-project-v1.js";

export const KAIROS_CUSTOMER_RUNTIME_ACTIONS_BUILD = "kairos-customer-runtime-actions-20260727-1";

export function applyKairosCustomerApproval(project = {}, input = {}) {
  const decision = clean(input.decision, 20);
  if (!['approved','changes_requested'].includes(decision)) throw actionError('CUSTOMER_DECISION_INVALID','Customer approval decision must be approved or changes_requested.');
  if (project.state !== 'awaiting_approval') throw actionError('CUSTOMER_APPROVAL_STATE_INVALID','Project is not awaiting customer approval.',409);
  const gate = clean(input.gate || 'production_plan',80);
  const approvals = [...(Array.isArray(project.approvals) ? project.approvals : [])];
  const index = approvals.findIndex((item) => item.gate === gate);
  const approval = Object.freeze({ gate, required: true, status: decision === 'approved' ? 'approved' : 'changes_requested', rationale: clean(input.rationale,500) || null, identityHash: clean(input.customerIdentityHash,180) || null, decidedAt: new Date().toISOString(), executionAuthorityGranted: false });
  if (index >= 0) approvals[index] = approval; else approvals.push(approval);
  if (decision === 'approved') return transitionKairosRuntimeProject(project,{ state:'planning', approvals, event:{ type:'approval_granted', state:'planning', summary:'Customer approved the production plan.' }, progress:{ percent:35, stage:'planning' } });
  return transitionKairosRuntimeProject(project,{ state:'planning', approvals, event:{ type:'approval_changes_requested', state:'planning', summary:'Customer requested changes to the production plan.' }, progress:{ percent:30, stage:'planning' } });
}

export function recordKairosCustomerNotification(project = {}, input = {}) {
  const type = clean(input.type,80);
  if (!type) throw actionError('NOTIFICATION_TYPE_REQUIRED','Notification type is required.');
  const notifications = [...(Array.isArray(project.notifications) ? project.notifications : [])];
  notifications.push(Object.freeze({ notificationId:`knotice_${crypto.randomUUID()}`, type, channel:clean(input.channel || 'portal',40), status:clean(input.status || 'recorded',40), createdAt:new Date().toISOString(), deliveredAt:input.deliveredAt ? new Date(input.deliveredAt).toISOString() : null }));
  return Object.freeze({ ...project, notifications:Object.freeze(notifications.slice(-100)), updatedAt:new Date().toISOString() });
}

function clean(value,max){return String(value||'').replace(/\u0000/g,'').trim().slice(0,max);}
function actionError(code,message,status=400){const error=new Error(message);error.code=code;error.status=status;return error;}
