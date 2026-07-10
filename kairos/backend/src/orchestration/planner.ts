import type {
  KairosExecutionPlan,
  KairosObjectiveInput,
  KairosPlanStep,
  KairosRouteDecision
} from './contracts.js';

export function createKairosExecutionPlan(
  input: KairosObjectiveInput,
  route: KairosRouteDecision
): KairosExecutionPlan {
  const objective = input.objective.trim();
  if (!objective) {
    throw Object.assign(new Error('A non-empty objective is required for planning.'), {
      code: 'objective_required',
      statusCode: 400
    });
  }

  const steps: KairosPlanStep[] = [
    {
      id: 'understand-objective',
      title: 'Confirm objective, context, constraints, and completion criteria',
      commandType: 'analyze',
      department: 'executive-office',
      dependsOn: [],
      requiresApproval: false,
      completionCriteria: [
        'Objective is unambiguous enough to plan.',
        'Known constraints and required evidence are recorded.'
      ]
    },
    {
      id: 'prepare-domain-plan',
      title: 'Prepare the governed domain execution plan',
      commandType: 'plan',
      department: route.primaryDepartment,
      dependsOn: ['understand-objective'],
      requiresApproval: false,
      completionCriteria: [
        'Steps are ordered and assigned.',
        'Dependencies, risks, approvals, and evidence requirements are identified.'
      ]
    },
    {
      id: 'review-before-execution',
      title: 'Review the proposed plan before any side effect',
      commandType: 'review',
      department: 'executive-office',
      dependsOn: ['prepare-domain-plan'],
      requiresApproval: true,
      completionCriteria: [
        'The plan respects constitutional and security boundaries.',
        'Any external or irreversible action remains blocked pending approval.'
      ]
    }
  ];

  return {
    objective,
    route,
    steps,
    risks: [
      'Insufficient context may produce an incorrect route or incomplete plan.',
      'Cross-domain objectives may require decomposition before execution.'
    ],
    approvalsRequired: ['Executive approval before external, irreversible, financial, publishing, deployment, or customer-data side effects.'],
    completionCriteria: [
      'A traceable routing decision exists.',
      'A reviewable plan exists.',
      'No external side effect has occurred.'
    ],
    sideEffectsAllowed: false
  };
}
