import type { IssueDraft } from '../../types/issues.js';
import type { StoredFeedbackReport } from '../../types/reports.js';

function formatJsonBlock(value: unknown): string {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
}

function buildImpactSection(report: StoredFeedbackReport): string[] {
  const score = typeof report.payload.impactScore === 'number' ? report.payload.impactScore : null;
  const assessment = report.payload.impactAssessment;
  if (score === null && (!assessment || typeof assessment !== 'object')) {
    return [];
  }

  return [
    '## Impact',
    `- Score: ${score ?? 'unknown'}`,
    ...(assessment && typeof assessment === 'object' && typeof (assessment as Record<string, unknown>).band === 'string'
      ? [`- Band: ${(assessment as Record<string, unknown>).band}`]
      : []),
    ...(assessment && typeof assessment === 'object'
      ? [formatJsonBlock(assessment)]
      : []),
    ''
  ];
}

function buildClassificationSection(report: StoredFeedbackReport): string[] {
  const classification = report.payload.classification;
  if (!classification || typeof classification !== 'object') {
    return [];
  }

  return [
    '## Classification',
    formatJsonBlock(classification),
    ''
  ];
}

function buildDuplicateSection(report: StoredFeedbackReport): string[] {
  const duplicates = report.payload.duplicates;
  if (!duplicates || typeof duplicates !== 'object') {
    return [];
  }

  return [
    '## Duplicate Candidates',
    formatJsonBlock(duplicates),
    ''
  ];
}

function readClassificationLabels(report: StoredFeedbackReport): string[] {
  const classification = report.payload.classification;
  if (!classification || typeof classification !== 'object') {
    return [];
  }

  const labels = (classification as Record<string, unknown>).labels;
  return Array.isArray(labels)
    ? labels.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
}

function readDuplicateLabels(report: StoredFeedbackReport): string[] {
  const duplicates = report.payload.duplicates;
  if (!duplicates || typeof duplicates !== 'object') {
    return [];
  }

  const candidates = (duplicates as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.some((candidate) => candidate && typeof candidate === 'object' && (candidate as Record<string, unknown>).confidence === 'high')
    ? ['possible-duplicate']
    : [];
}

function buildSlackDraft(report: StoredFeedbackReport): IssueDraft {
  const reaction = typeof report.payload.reaction === 'string' ? report.payload.reaction : 'unknown';

  return {
    title: report.title ? `Slack report: ${report.title}` : `Slack report ${report.id}`,
    body: [
      '## Summary',
      'Internal report ingested from Slack.',
      '',
      ...buildImpactSection(report),
      ...buildClassificationSection(report),
      ...buildDuplicateSection(report),
      '## Source',
      `- Report ID: ${report.id}`,
      `- Reporter: ${report.reporterIdentifier ?? 'unknown'}`,
      `- Reaction: ${reaction}`,
      '',
      '## Raw Payload',
      formatJsonBlock(report.payload)
    ].join('\n'),
    labels: [...new Set(['bug', 'triaged', 'source:slack', ...readClassificationLabels(report), ...readDuplicateLabels(report)])]
  };
}

function buildObservabilityDraft(report: StoredFeedbackReport): IssueDraft {
  return {
    title: report.title ? `Telemetry: ${report.title}` : `Telemetry event ${report.id}`,
    body: [
      '## Summary',
      'Internal report ingested from observability telemetry.',
      '',
      ...buildImpactSection(report),
      ...buildClassificationSection(report),
      ...buildDuplicateSection(report),
      '## Source',
      `- Report ID: ${report.id}`,
      `- Provider: ${report.source}`,
      `- Severity: ${report.severity}`,
      '',
      '## Event Payload',
      formatJsonBlock(report.payload)
    ].join('\n'),
    labels: [...new Set(['bug', 'triaged', `source:${report.source}`, ...readClassificationLabels(report), ...readDuplicateLabels(report)])]
  };
}

function buildExtensionDraft(report: StoredFeedbackReport): IssueDraft {
  const artifacts = typeof report.payload.artifacts === 'object' && report.payload.artifacts !== null
    ? report.payload.artifacts
    : {};
  const sourceLabel = report.source === 'hosted-feedback' ? 'hosted feedback' : 'browser extension';
  const titlePrefix = report.source === 'hosted-feedback' ? 'Customer feedback' : 'QA capture';

  return {
    title: report.title ? `${titlePrefix}: ${report.title}` : `Captured issue ${report.id}`,
    body: [
      '## Summary',
      `Captured ${sourceLabel} report from a staging, production, or development session.`,
      '',
      ...buildImpactSection(report),
      ...buildClassificationSection(report),
      ...buildDuplicateSection(report),
      '## Source',
      `- Report ID: ${report.id}`,
      `- Reporter: ${report.reporterIdentifier ?? 'unknown'}`,
      `- Severity: ${report.severity}`,
      '',
      '## Artifact Flags',
      formatJsonBlock(artifacts),
      '',
      '## Full Payload',
      formatJsonBlock(report.payload)
    ].join('\n'),
    labels: [...new Set(['bug', 'triaged', `source:${report.source}`, ...readClassificationLabels(report), ...readDuplicateLabels(report)])]
  };
}

export function createIssueDraft(report: StoredFeedbackReport): IssueDraft {
  switch (report.source) {
    case 'slack':
      return buildSlackDraft(report);
    case 'extension':
    case 'hosted-feedback':
      return buildExtensionDraft(report);
    case 'sentry':
    case 'datadog':
    case 'newrelic':
      return buildObservabilityDraft(report);
  }
}