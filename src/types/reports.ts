export type FeedbackSource = 'slack' | 'extension' | 'hosted-feedback' | 'sentry' | 'datadog' | 'newrelic';

export interface StoredFeedbackReport {
  id: string;
  projectId?: string;
  source: FeedbackSource;
  externalId?: string;
  title?: string;
  status: 'received' | 'triaged' | 'drafted' | 'awaiting-review';
  severity: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
  reporterIdentifier?: string;
  createdAt?: string;
  updatedAt?: string;
  payload: Record<string, unknown>;
}

export interface StoredTriageJob {
  id: string;
  reportId: string;
  jobType: 'triage' | 'replay' | 'agent-task' | 'agent-execution' | 'shadow-suite-run';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  priority: number;
  payload: Record<string, unknown>;
}