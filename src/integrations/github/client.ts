import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

import type { AppConfig } from '../../support/config.js';

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

export interface GitHubIntegration {
  mode: AppConfig['GITHUB_AUTH_MODE'];
  enabled: boolean;
  repository: string;
  usingTestRepository: boolean;
  createIssueDraft(input: GitHubIssueDraftInput): Promise<{ number: number; url: string }>;
  createPullRequest(input: GitHubPullRequestInput): Promise<{ number: number; url: string }>;
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

function resolveRepositorySettings(config: AppConfig): { owner?: string; repo?: string; repository: string } {
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

function createAppClient(config: AppConfig): Octokit {
  if (!config.GITHUB_APP_ID || !config.GITHUB_APP_INSTALLATION_ID || !config.GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App credentials are required when GITHUB_AUTH_MODE=app');
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.GITHUB_APP_ID,
      installationId: config.GITHUB_APP_INSTALLATION_ID,
      privateKey: config.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
    }
  });
}

export function createGitHubIntegration(config: AppConfig): GitHubIntegration {
  const repositorySettings = resolveRepositorySettings(config);
  const repository = repositorySettings.repository;

  if (!config.GITHUB_DRAFT_SYNC_ENABLED) {
    return {
      mode: config.GITHUB_AUTH_MODE,
      enabled: false,
      repository,
      usingTestRepository: config.GITHUB_USE_TEST_REPO,
      async createIssueDraft() {
        throw new Error('GitHub draft sync is disabled');
      },
      async createPullRequest() {
        throw new Error('GitHub draft sync is disabled');
      }
    };
  }

  if (!repositorySettings.owner || !repositorySettings.repo) {
    throw new Error('GITHUB_OWNER and GITHUB_REPO are required when GitHub draft sync is enabled');
  }

  const owner = repositorySettings.owner;
  const repo = repositorySettings.repo;

  const octokit = config.GITHUB_AUTH_MODE === 'app'
    ? createAppClient(config)
    : createPatClient(config);

  return {
    mode: config.GITHUB_AUTH_MODE,
    enabled: true,
    repository,
    usingTestRepository: config.GITHUB_USE_TEST_REPO,
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
    }
  };
}