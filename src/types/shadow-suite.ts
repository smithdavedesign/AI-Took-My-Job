export interface StoredShadowSuite {
  id: string;
  feedbackReportId: string;
  replayRunId?: string;
  name: string;
  environment: string;
  targetOrigin?: string;
  cadenceSeconds: number;
  expectedOutcome: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  status: 'active' | 'paused' | 'retired';
  retentionReason?: string;
  metadata: Record<string, unknown>;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface StoredShadowSuiteRun {
  id: string;
  shadowSuiteId: string;
  replayRunId?: string;
  status: 'queued' | 'processing' | 'passed' | 'failed';
  targetOrigin?: string;
  expectedOutcome: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  actualOutcome?: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  triggeredBy?: string;
  summary: Record<string, unknown>;
  failureReason?: string;
}