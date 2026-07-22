import type { KairosPublishingProject } from './contracts.js';

export interface PublishingProjectRepository {
  create(project: KairosPublishingProject): Promise<KairosPublishingProject>;
  get(projectId: string): Promise<KairosPublishingProject | null>;
  save(project: KairosPublishingProject): Promise<KairosPublishingProject>;
}

export class ProjectAlreadyExistsError extends Error {
  constructor(projectId: string) {
    super(`Publishing project already exists: ${projectId}`);
    this.name = 'ProjectAlreadyExistsError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Publishing project not found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

export class InMemoryPublishingProjectRepository implements PublishingProjectRepository {
  readonly #projects = new Map<string, KairosPublishingProject>();

  async create(project: KairosPublishingProject): Promise<KairosPublishingProject> {
    if (this.#projects.has(project.id)) throw new ProjectAlreadyExistsError(project.id);
    const stored = structuredClone(project);
    this.#projects.set(project.id, stored);
    return structuredClone(stored);
  }

  async get(projectId: string): Promise<KairosPublishingProject | null> {
    const project = this.#projects.get(projectId);
    return project ? structuredClone(project) : null;
  }

  async save(project: KairosPublishingProject): Promise<KairosPublishingProject> {
    if (!this.#projects.has(project.id)) throw new ProjectNotFoundError(project.id);
    const stored = structuredClone(project);
    this.#projects.set(project.id, stored);
    return structuredClone(stored);
  }
}
