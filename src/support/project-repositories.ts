import type { ProjectRepository } from '../repositories/project-repository.js';
import type { RepoConnectionRepository } from '../repositories/repo-connection-repository.js';
import type { StoredProject, StoredRepoConnection } from '../types/onboarding.js';

export interface ProjectRepositoryScope {
  project: StoredProject | null;
  activeConnections: StoredRepoConnection[];
  availableRepositories: string[];
  defaultConnection: StoredRepoConnection | null;
  selectedConnection: StoredRepoConnection | null;
}

export async function resolveProjectRepositoryScope(input: {
  projectId: string;
  repoConnections: RepoConnectionRepository;
  projects?: ProjectRepository;
  repository?: string | null | undefined;
}): Promise<ProjectRepositoryScope> {
  const [project, connections] = await Promise.all([
    input.projects ? input.projects.findById(input.projectId) : Promise.resolve(null),
    input.repoConnections.findByProjectId(input.projectId)
  ]);
  const activeConnections = connections.filter((connection) => connection.status === 'active');
  const availableRepositories = activeConnections.map((connection) => connection.repository);
  const routingDefaultRepository = project && typeof project.routingConfig.defaultRepository === 'string'
    ? project.routingConfig.defaultRepository
    : null;
  const defaultConnection = activeConnections.find((connection) => connection.isDefault)
    ?? (routingDefaultRepository
      ? activeConnections.find((connection) => connection.repository === routingDefaultRepository) ?? null
      : null)
    ?? (activeConnections.length === 1 ? activeConnections[0] ?? null : null);
  const selectedConnection = input.repository
    ? activeConnections.find((connection) => connection.repository === input.repository) ?? null
    : defaultConnection;

  return {
    project,
    activeConnections,
    availableRepositories,
    defaultConnection,
    selectedConnection
  };
}