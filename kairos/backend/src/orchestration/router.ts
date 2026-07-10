import type {
  KairosDepartmentDefinition,
  KairosDepartmentId,
  KairosObjectiveInput,
  KairosRouteDecision
} from './contracts.js';
import {
  KAIROS_DEPARTMENTS,
  KAIROS_DEPARTMENT_REGISTRY_VERSION
} from './registry.js';

interface ScoredDepartment {
  department: KairosDepartmentDefinition;
  score: number;
  matchedKeywords: string[];
}

function normalizeObjective(objective: string): string {
  return objective.trim().toLowerCase().replace(/\s+/g, ' ');
}

function scoreDepartment(objective: string, department: KairosDepartmentDefinition): ScoredDepartment {
  const matchedKeywords = department.keywords.filter(keyword => objective.includes(keyword.toLowerCase()));
  return {
    department,
    score: matchedKeywords.length,
    matchedKeywords
  };
}

function uniqueDepartments(ids: KairosDepartmentId[]): KairosDepartmentId[] {
  return [...new Set(ids)];
}

export function routeKairosObjective(input: KairosObjectiveInput): KairosRouteDecision {
  const normalizedObjective = normalizeObjective(input.objective);
  if (!normalizedObjective) {
    throw Object.assign(new Error('A non-empty objective is required for routing.'), {
      code: 'objective_required',
      statusCode: 400
    });
  }

  const scored = KAIROS_DEPARTMENTS
    .map(department => scoreDepartment(normalizedObjective, department))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.department.id.localeCompare(right.department.id);
    });

  const positiveMatches = scored.filter(candidate => candidate.score > 0);
  const primary = positiveMatches[0];

  if (!primary) {
    return {
      primaryDepartment: 'executive-office',
      supportingDepartments: [],
      confidence: 0.35,
      rationale: 'No registered domain matched strongly enough; the Executive Office must clarify or decompose the objective.',
      matchedCapabilities: ['objective clarification', 'cross-department decomposition'],
      registryVersion: KAIROS_DEPARTMENT_REGISTRY_VERSION
    };
  }

  const supportingDepartments = uniqueDepartments(
    positiveMatches
      .slice(1)
      .filter(candidate => candidate.score >= Math.max(1, primary.score - 1))
      .map(candidate => candidate.department.id)
  ).slice(0, 3);

  const totalMatches = positiveMatches.reduce((sum, candidate) => sum + candidate.score, 0);
  const confidence = Math.min(0.95, Math.max(0.5, primary.score / Math.max(1, totalMatches) + 0.35));
  const matchedCapabilities = primary.department.capabilities.filter(capability => {
    const terms = capability.toLowerCase().split(/\s+/);
    return terms.some(term => normalizedObjective.includes(term));
  });

  return {
    primaryDepartment: primary.department.id,
    supportingDepartments,
    confidence: Number(confidence.toFixed(2)),
    rationale: `Matched ${primary.matchedKeywords.length} routing keyword(s) for ${primary.department.name}: ${primary.matchedKeywords.join(', ')}.`,
    matchedCapabilities: matchedCapabilities.length > 0
      ? matchedCapabilities
      : [...primary.department.capabilities],
    registryVersion: KAIROS_DEPARTMENT_REGISTRY_VERSION
  };
}
