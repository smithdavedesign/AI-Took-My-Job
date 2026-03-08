export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

export interface StoredGitHubIssueLink {
  id: string;
  feedbackReportId: string;
  repository: string;
  draftTitle: string;
  draftBody: string;
  draftLabels: string[];
  issueNumber?: number;
  issueUrl?: string;
  state: 'local-draft' | 'synced' | 'sync-failed';
}