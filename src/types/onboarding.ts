export interface StoredWorkspace {
  id: string;
  slug: string;
  name: string;
}

export interface StoredProject {
  id: string;
  workspaceId: string;
  projectKey: string;
  name: string;
  status: 'active' | 'inactive';
  routingConfig: Record<string, unknown>;
}

export interface StoredGitHubInstallation {
  id: string;
  workspaceId: string;
  provider: 'github';
  installationId: number;
  accountLogin?: string;
  accountType?: string;
  metadata: Record<string, unknown>;
}

export interface StoredRepoConnection {
  id: string;
  projectId: string;
  githubInstallationId?: string;
  provider: 'github';
  repository: string;
  isDefault: boolean;
  status: 'active' | 'inactive';
  config: Record<string, unknown>;
}