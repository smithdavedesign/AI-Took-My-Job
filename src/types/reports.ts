export type FeedbackSource = 'slack' | 'extension' | 'sentry' | 'datadog' | 'newrelic';

export interface StoredFeedbackReport {
  id: string;
  source: FeedbackSource;
  externalId?: string;
  title?: string;
  status: 'received' | 'triaged' | 'drafted';
  severity: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
  reporterIdentifier?: string;
  payload: Record<string, unknown>;
}

export interface StoredTriageJob {
  id: string;
  reportId: string;
  jobType: 'triage' | 'replay' | 'agent-task' | 'agent-execution';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  priority: number;
  payload: Record<string, unknown>;
}