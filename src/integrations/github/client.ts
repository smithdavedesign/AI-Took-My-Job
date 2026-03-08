import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

import type { AppConfig } from '../../support/config.js';
import type { GitHubInstallationRepository } from '../../repositories/github-installation-repository.js';
import type { RepoConnectionRepository } from '../../repositories/repo-connection-repository.js';

export interface GitHubIssueDraftInput {
  title: string;
  body: string;
  labels?: string[];
}

export interface GitHubPullRequestInput {
  repository?: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
}

export interface GitHubMergePullRequestInput {
  repository?: string;
  pullRequestNumber: number;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}

export interface GitHubIntegration {
  mode: AppConfig['GITHUB_AUTH_MODE'];
  enabled: boolean;
  repository: string;
  usingTestRepository: boolean;
  resolveGitAuthToken(): Promise<string | undefined>;
  createIssueDraft(input: GitHubIssueDraftInput): Promise<{ number: number; url: string }>;
  createPullRequest(input: GitHubPullRequestInput): Promise<{ number: number; url: string }>;
  mergePullRequest(input: GitHubMergePullRequestInput): Promise<{ mergeCommitSha: string; merged: boolean; message: string }>;
}

export interface GitHubIntegrationResolver {
  mode: AppConfig['GITHUB_AUTH_MODE'];
  enabled: boolean;
  repository: string;
  usingTestRepository: boolean;
  resolve(input?: { projectId?: string | undefined; repository?: string | null | undefined }): Promise<GitHubIntegration>;
  resolveRepository(input?: { projectId?: string | undefined; repository?: string | null | undefined }): Promise<string>;
  isEnabled(input?: { projectId?: string | undefined; repository?: string | null | undefined }): Promise<boolean>;
}

export interface GitHubAppInstallationDetails {
  installationId: number;
  accountLogin?: string;
  accountType?: string;
  targetType?: string;
  repositoriesSelection?: string;
  permissions: Record<string, string>;
}

export interface GitHubInstallationRepositorySummary {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch?: string;
}

function parseRepository(repository: string): { owner: string; repo: string } {
  const parts = repository.split('/').filter(Boolean);

  if (parts.length !== 2) {
    throw new Error(`invalid GitHub repository value: ${repository}`);
  }

  return {
    owner: parts[0] as string,
    repo: parts[1] as string
  };
}

function resolveRepositorySettings(config: AppConfig, repositoryOverride?: string): { owner?: string; repo?: string; repository: string } {
  if (repositoryOverride) {
    if (!repositoryOverride.includes('/') || repositoryOverride.startsWith('/') || repositoryOverride.startsWith('.')) {
      return {
        repository: repositoryOverride
      };
    }

    const { owner, repo } = parseRepository(repositoryOverride);
    return {
      owner,
      repo,
      repository: repositoryOverride
    };
  }

  if (config.GITHUB_USE_TEST_REPO && config.GITHUB_TEST_OWNER && config.GITHUB_TEST_REPO) {
    return {
      owner: config.GITHUB_TEST_OWNER,
      repo: config.GITHUB_TEST_REPO,
      repository: `${config.GITHUB_TEST_OWNER}/${config.GITHUB_TEST_REPO}`
    };
  }

  const repoValue = config.GITHUB_REPO;

  if (repoValue?.startsWith('https://github.com/')) {
    const parsed = new URL(repoValue);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const owner = parts[0];
    const repo = parts[1];

    return {
      repository: owner && repo ? `${owner}/${repo}` : repoValue,
      ...(config.GITHUB_OWNER ?? owner ? { owner: config.GITHUB_OWNER ?? owner } : {}),
      ...(repo ? { repo } : {})
    };
  }

  if (repoValue && config.GITHUB_OWNER) {
    return {
      owner: config.GITHUB_OWNER,
      repo: repoValue,
      repository: `${config.GITHUB_OWNER}/${repoValue}`
    };
  }

  return {
    repository: [config.GITHUB_OWNER, repoValue].filter(Boolean).join('/'),
    ...(config.GITHUB_OWNER ? { owner: config.GITHUB_OWNER } : {}),
    ...(repoValue ? { repo: repoValue } : {})
  };
}

function createPatClient(config: AppConfig): Octokit {
  if (!config.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required when GITHUB_AUTH_MODE=pat');
  }

  return new Octokit({
    auth: config.GITHUB_TOKEN
  });
}

function createAppManagerClient(config: AppConfig): Octokit {
  if (!config.GITHUB_APP_ID || !config.GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App credentials are required when using GitHub App onboarding');
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.GITHUB_APP_ID,
      privateKey: config.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
    }
  });
}

function createAppClient(config: AppConfig, installationId = config.GITHUB_APP_INSTALLATION_ID): Octokit {
  if (!config.GITHUB_APP_ID || !installationId || !config.GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App credentials are required when GITHUB_AUTH_MODE=app');
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.GITHUB_APP_ID,
      installationId,
      privateKey: config.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
    }
  });
}

async function resolveAppInstallationToken(config: AppConfig, installationId: number): Promise<string> {
  if (!config.GITHUB_APP_ID || !config.GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App credentials are required when GITHUB_AUTH_MODE=app');
  }

  const auth = createAppAuth({
    appId: config.GITHUB_APP_ID,
    privateKey: config.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
  });
  const installationAuth = await auth({
    type: 'installation',
    installationId
  });

  return installationAuth.token;
}

export function buildGitHubAppInstallationUrl(config: AppConfig, state: string): string {
  if (!config.GITHUB_APP_SLUG) {
    throw new Error('GITHUB_APP_SLUG is required to build a GitHub App installation URL');
  }

  const url = new URL(`https://github.com/apps/${config.GITHUB_APP_SLUG}/installations/new`);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function getGitHubAppInstallationDetails(
  config: AppConfig,
  installationId: number
): Promise<GitHubAppInstallationDetails> {
  const octokit = createAppManagerClient(config);
  const response = await octokit.request('GET /app/installations/{installation_id}', {
    installation_id: installationId
  });
  const account = response.data.account;
  const accountLogin = account && 'login' in account ? account.login : undefined;
  const accountType = account && 'type' in account ? account.type : undefined;

  return {
    installationId: response.data.id,
    ...(accountLogin ? { accountLogin } : {}),
    ...(accountType ? { accountType } : {}),
    ...(response.data.target_type ? { targetType: response.data.target_type } : {}),
    ...(response.data.repository_selection ? { repositoriesSelection: response.data.repository_selection } : {}),
    permissions: Object.fromEntries(Object.entries(response.data.permissions ?? {}).map(([key, value]) => [key, String(value)]))
  };
}

export async function listGitHubInstallationRepositories(
  config: AppConfig,
  installationId: number
): Promise<GitHubInstallationRepositorySummary[]> {
  const octokit = createAppClient(config, installationId);
  const repositories: GitHubInstallationRepositorySummary[] = [];
  let page = 1;

  while (page <= 5) {
    const response = await octokit.apps.listReposAccessibleToInstallation({
      per_page: 100,
      page
    });

    repositories.push(...response.data.repositories.map((repository) => ({
      id: repository.id,
      fullName: repository.full_name,
      private: repository.private,
      ...(repository.default_branch ? { defaultBranch: repository.default_branch } : {})
    })));

    if (response.data.repositories.length < 100) {
      break;
    }

    page += 1;
  }

  return repositories;
}

export function createGitHubIntegration(
  config: AppConfig,
  overrides: {
    repository?: string;
    installationId?: number;
    mode?: AppConfig['GITHUB_AUTH_MODE'];
    token?: string;
    enabled?: boolean;
  } = {}
): GitHubIntegration {
  const repositorySettings = resolveRepositorySettings(config, overrides.repository);
  const repository = repositorySettings.repository;
  const mode = overrides.mode ?? config.GITHUB_AUTH_MODE;

  if (!config.GITHUB_DRAFT_SYNC_ENABLED || overrides.enabled === false) {
    return {
      mode,
      enabled: false,
      repository,
      usingTestRepository: config.GITHUB_USE_TEST_REPO,
      async resolveGitAuthToken() {
        return undefined;
      },
      async createIssueDraft() {
        throw new Error('GitHub draft sync is disabled');
      },
      async createPullRequest() {
        throw new Error('GitHub draft sync is disabled');
      },
      async mergePullRequest() {
        throw new Error('GitHub draft sync is disabled');
      }
    };
  }

  if (!repositorySettings.owner || !repositorySettings.repo) {
    throw new Error('GITHUB_OWNER and GITHUB_REPO are required when GitHub draft sync is enabled');
  }

  const owner = repositorySettings.owner;
  const repo = repositorySettings.repo;

  const octokit = mode === 'app'
    ? createAppClient(config, overrides.installationId)
    : overrides.token
      ? new Octokit({ auth: overrides.token })
      : createPatClient(config);

  return {
    mode,
    enabled: true,
    repository,
    usingTestRepository: config.GITHUB_USE_TEST_REPO,
    async resolveGitAuthToken() {
      if (mode === 'app') {
        const installationId = overrides.installationId ?? config.GITHUB_APP_INSTALLATION_ID;
        if (!installationId) {
          return undefined;
        }

        return resolveAppInstallationToken(config, installationId);
      }

      return overrides.token ?? config.GITHUB_TOKEN ?? undefined;
    },
    async createIssueDraft(input) {
      const response = await octokit.rest.issues.create({
        owner,
        repo,
        title: input.title,
        body: input.body,
        ...(input.labels ? { labels: input.labels } : {})
      });

      return {
        number: response.data.number,
        url: response.data.html_url
      };
    },
    async createPullRequest(input) {
      const target = input.repository ? parseRepository(input.repository) : { owner, repo };
      const response = await octokit.rest.pulls.create({
        owner: target.owner,
        repo: target.repo,
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        draft: input.draft ?? true
      });

      return {
        number: response.data.number,
        url: response.data.html_url
      };
    },
    async mergePullRequest(input) {
      const target = input.repository ? parseRepository(input.repository) : { owner, repo };
      const response = await octokit.rest.pulls.merge({
        owner: target.owner,
        repo: target.repo,
        pull_number: input.pullRequestNumber,
        ...(input.mergeMethod ? { merge_method: input.mergeMethod } : {})
      });

      return {
        mergeCommitSha: response.data.sha,
        merged: response.data.merged,
        message: response.data.message
      };
    }
  };
}

export function createGitHubIntegrationResolver(input: {
  config: AppConfig;
  repoConnections: RepoConnectionRepository;
  githubInstallations: GitHubInstallationRepository;
}): GitHubIntegrationResolver {
  const defaultIntegration = createGitHubIntegration(input.config);

  async function resolveProjectConnection(projectId?: string, repository?: string | null) {
    if (!projectId) {
      return null;
    }

    if (repository) {
      const exactConnection = await input.repoConnections.findByProjectIdAndRepository(projectId, repository);
      if (exactConnection) {
        return exactConnection;
      }
    }

    return input.repoConnections.findDefaultByProjectId(projectId);
  }

  return {
    mode: defaultIntegration.mode,
    enabled: defaultIntegration.enabled,
    repository: defaultIntegration.repository,
    usingTestRepository: defaultIntegration.usingTestRepository,
    async resolve(options = {}) {
      const requestedRepository = options.repository ?? undefined;
      if (requestedRepository && (!requestedRepository.includes('/') || requestedRepository.startsWith('/') || requestedRepository.startsWith('.'))) {
        return createGitHubIntegration(input.config, {
          repository: requestedRepository,
          enabled: false
        });
      }

      const connection = await resolveProjectConnection(options.projectId, requestedRepository ?? null);
      if (connection && connection.status === 'active' && connection.provider === 'github') {
        const installation = connection.githubInstallationId
          ? await input.githubInstallations.findById(connection.githubInstallationId)
          : null;

        if (installation) {
          return createGitHubIntegration(input.config, {
            repository: connection.repository,
            mode: 'app',
            installationId: installation.installationId,
            enabled: true
          });
        }

        return createGitHubIntegration(input.config, {
          repository: connection.repository,
          enabled: false
        });
      }

      if (requestedRepository) {
        return createGitHubIntegration(input.config, {
          repository: requestedRepository
        });
      }

      return defaultIntegration;
    },
    async resolveRepository(options = {}) {
      const resolved = await this.resolve(options);
      return resolved.repository;
    },
    async isEnabled(options = {}) {
      const resolved = await this.resolve(options);
      return resolved.enabled;
    }
  };
}