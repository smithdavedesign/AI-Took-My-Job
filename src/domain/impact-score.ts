export interface ImpactSignal {
  source: 'slack' | 'extension' | 'hosted-feedback' | 'sentry' | 'datadog' | 'newrelic';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  breadth?: number;
  frequency?: number;
}

const sourceWeights: Record<ImpactSignal['source'], number> = {
  slack: 20,
  extension: 30,
  'hosted-feedback': 28,
  sentry: 35,
  datadog: 35,
  newrelic: 35
};

const severityWeights: Record<NonNullable<ImpactSignal['severity']>, number> = {
  low: 10,
  medium: 20,
  high: 35,
  critical: 50
};

export function computeInitialImpactScore(signal: ImpactSignal): number {
  const sourceScore = sourceWeights[signal.source];
  const severityScore = signal.severity ? severityWeights[signal.severity] : 15;
  const breadthScore = Math.min((signal.breadth ?? 1) * 8, 24);
  const frequencyScore = Math.min(Math.floor((signal.frequency ?? 1) / 5) * 5, 30);

  return Math.min(sourceScore + severityScore + breadthScore + frequencyScore, 100);
}