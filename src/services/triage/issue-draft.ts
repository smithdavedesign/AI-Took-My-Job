import type { IssueDraft } from '../../types/issues.js';
import type { StoredFeedbackReport } from '../../types/reports.js';

function formatJsonBlock(value: unknown): string {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
}

function buildSlackDraft(report: StoredFeedbackReport): IssueDraft {
  const reaction = typeof report.payload.reaction === 'string' ? report.payload.reaction : 'unknown';

  return {
    title: report.title ? `Slack report: ${report.title}` : `Slack report ${report.id}`,
    body: [
      '## Summary',
      'Internal report ingested from Slack.',
      '',
      '## Source',
      `- Report ID: ${report.id}`,
      `- Reporter: ${report.reporterIdentifier ?? 'unknown'}`,
      `- Reaction: ${reaction}`,
      '',
      '## Raw Payload',
      formatJsonBlock(report.payload)
    ].join('\n'),
    labels: ['bug', 'triaged', 'source:slack']
  };
}

function buildObservabilityDraft(report: StoredFeedbackReport): IssueDraft {
  return {
    title: report.title ? `Telemetry: ${report.title}` : `Telemetry event ${report.id}`,
    body: [
      '## Summary',
      'Internal report ingested from observability telemetry.',
      '',
      '## Source',
      `- Report ID: ${report.id}`,
      `- Provider: ${report.source}`,
      `- Severity: ${report.severity}`,
      '',
      '## Event Payload',
      formatJsonBlock(report.payload)
    ].join('\n'),
    labels: ['bug', 'triaged', `source:${report.source}`]
  };
}

function buildExtensionDraft(report: StoredFeedbackReport): IssueDraft {
  const artifacts = typeof report.payload.artifacts === 'object' && report.payload.artifacts !== null
    ? report.payload.artifacts
    : {};

  return {
    title: report.title ? `QA capture: ${report.title}` : `Captured issue ${report.id}`,
    body: [
      '## Summary',
      'Internal browser extension report captured from a staging or development session.',
      '',
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
    labels: ['bug', 'triaged', 'source:extension']
  };
}

export function createIssueDraft(report: StoredFeedbackReport): IssueDraft {
  switch (report.source) {
    case 'slack':
      return buildSlackDraft(report);
    case 'extension':
      return buildExtensionDraft(report);
    case 'sentry':
    case 'datadog':
    case 'newrelic':
      return buildObservabilityDraft(report);
  }
}