import assert from 'node:assert/strict';
import test from 'node:test';
import { createKairosExecutionPlan } from '../src/orchestration/planner.js';
import { routeKairosObjective } from '../src/orchestration/router.js';

const base = {
  mode: 'admin' as const,
  surface: 'dashboard' as const
};

test('unknown objectives fall back to Executive Office', () => {
  const route = routeKairosObjective({ ...base, objective: 'Consider a completely novel strategic possibility' });
  assert.equal(route.primaryDepartment, 'executive-office');
  assert.equal(route.confidence, 0.35);
});

test('publishing objectives route deterministically', () => {
  const input = { ...base, objective: 'Prepare the manuscript and publishing release workflow' };
  assert.deepEqual(routeKairosObjective(input), routeKairosObjective(input));
  assert.equal(routeKairosObjective(input).primaryDepartment, 'publishing');
});

test('cross-domain objectives identify supporting departments', () => {
  const route = routeKairosObjective({
    ...base,
    objective: 'Design a book cover and prepare the publishing marketing campaign'
  });
  assert.ok(route.supportingDepartments.length > 0);
});

test('execution plans prohibit side effects and require review approval', () => {
  const input = { ...base, objective: 'Publish a new customer book' };
  const route = routeKairosObjective(input);
  const plan = createKairosExecutionPlan(input, route);
  assert.equal(plan.sideEffectsAllowed, false);
  assert.ok(plan.steps.some(step => step.requiresApproval));
  assert.ok(plan.completionCriteria.includes('No external side effect has occurred.'));
});

test('blank objectives are rejected', () => {
  assert.throws(
    () => routeKairosObjective({ ...base, objective: '   ' }),
    (error: unknown) => error instanceof Error && (error as Error & { code?: string }).code === 'objective_required'
  );
});
