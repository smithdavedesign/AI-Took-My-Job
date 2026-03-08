export interface StoredAgentTask {
  id: string;
  feedbackReportId: string;
  processingJobId?: string;
  requestedBy: string;
  targetRepository: string;
  title: string;
  objective: string;
  executionMode: 'investigate' | 'fix';
  acceptanceCriteria: string[];
  contextNotes?: string;
  status: 'queued' | 'preparing' | 'ready' | 'failed';
  preparedContext: Record<string, unknown>;
  failureReason?: string;
}