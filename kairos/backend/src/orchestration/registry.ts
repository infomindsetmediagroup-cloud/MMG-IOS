import type { KairosDepartmentDefinition } from './contracts.js';

export const KAIROS_DEPARTMENT_REGISTRY_VERSION = '2026-07-10.1';

export const KAIROS_DEPARTMENTS: readonly KairosDepartmentDefinition[] = [
  {
    id: 'executive-office',
    name: 'Executive Office',
    capabilities: ['objective clarification', 'cross-department decomposition', 'priority coordination'],
    keywords: ['strategy', 'priority', 'roadmap', 'objective', 'coordinate', 'company', 'executive'],
    requiresApprovalForExecution: true
  },
  {
    id: 'publishing',
    name: 'Publishing',
    capabilities: ['book production', 'editorial workflow', 'metadata preparation', 'release packaging'],
    keywords: ['book', 'publish', 'publishing', 'editorial', 'manuscript', 'kdp', 'isbn'],
    requiresApprovalForExecution: true
  },
  {
    id: 'marketing',
    name: 'Marketing',
    capabilities: ['campaign planning', 'audience development', 'content distribution', 'brand promotion'],
    keywords: ['marketing', 'campaign', 'social', 'tiktok', 'promotion', 'audience', 'content'],
    requiresApprovalForExecution: true
  },
  {
    id: 'design-studio',
    name: 'Design Studio',
    capabilities: ['creative production', 'asset refinement', 'format conversion', 'production design'],
    keywords: ['design', 'image', 'cover', 'creative', 'asset', 'resize', 'branding'],
    requiresApprovalForExecution: true
  },
  {
    id: 'knowledge',
    name: 'Knowledge',
    capabilities: ['knowledge preservation', 'research organization', 'retrieval', 'documentation'],
    keywords: ['knowledge', 'research', 'document', 'library', 'archive', 'reference', 'remember'],
    requiresApprovalForExecution: false
  },
  {
    id: 'customer-success',
    name: 'Customer Success',
    capabilities: ['customer guidance', 'onboarding', 'support coordination', 'progress review'],
    keywords: ['customer', 'client', 'support', 'onboarding', 'subscription', 'member', 'help'],
    requiresApprovalForExecution: true
  },
  {
    id: 'engineering',
    name: 'Engineering',
    capabilities: ['software implementation', 'repository maintenance', 'testing', 'deployment preparation'],
    keywords: ['code', 'repository', 'github', 'api', 'backend', 'frontend', 'bug', 'deploy', 'engineering'],
    requiresApprovalForExecution: true
  },
  {
    id: 'security',
    name: 'Security',
    capabilities: ['security review', 'authorization analysis', 'incident response', 'release gating'],
    keywords: ['security', 'auth', 'authentication', 'authorization', 'secret', 'vulnerability', 'incident'],
    requiresApprovalForExecution: true
  },
  {
    id: 'commerce',
    name: 'Commerce',
    capabilities: ['product operations', 'shopify preparation', 'billing coordination', 'offer management'],
    keywords: ['shopify', 'product', 'price', 'billing', 'checkout', 'commerce', 'store'],
    requiresApprovalForExecution: true
  },
  {
    id: 'analytics',
    name: 'Analytics',
    capabilities: ['performance analysis', 'metric interpretation', 'trend review', 'report preparation'],
    keywords: ['analytics', 'metric', 'report', 'performance', 'trend', 'revenue', 'conversion'],
    requiresApprovalForExecution: false
  }
] as const;
