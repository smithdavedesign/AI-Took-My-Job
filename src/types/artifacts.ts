export interface StoredArtifactBundle {
  id: string;
  feedbackReportId: string;
  artifactType: 'screen-recording' | 'har' | 'local-storage' | 'session-storage';
  storageKey: string;
  metadata: Record<string, unknown>;
}