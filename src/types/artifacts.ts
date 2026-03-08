export interface StoredArtifactBundle {
  id: string;
  feedbackReportId: string;
  artifactType:
    | 'screen-recording'
    | 'har'
    | 'console-logs'
    | 'local-storage'
    | 'session-storage'
    | 'agent-task-markdown'
    | 'agent-context'
    | 'agent-output'
    | 'agent-diff'
    | 'agent-validation'
    | 'agent-replay-validation'
    | 'agent-validation-policy';
  storageKey: string;
  metadata: Record<string, unknown>;
}