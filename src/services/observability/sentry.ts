import type { FeedbackSource } from '../../types/reports.js';

export interface SentryWebhookPayload {
  action: string;
  actor?: { name?: string; type?: string };
  data: {
    issue: {
      id: string;
      shortId?: string;
      title: string;
      culprit?: string;
      level?: 'warning' | 'error' | 'fatal' | 'info';
      count?: string;
      permalink?: string;
      project?: { name?: string };
      metadata?: Record<string, unknown>;
    };
  };
}

export interface NormalizedObservabilityEvent {
  provider: FeedbackSource;
  eventType: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  fingerprint?: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
  frequency: number;
}

function mapSentryLevel(level?: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (level) {
    case 'fatal':
      return 'critical';
    case 'error':
      return 'high';
    case 'warning':
      return 'medium';
    default:
      return 'low';
  }
}

export function normalizeSentryWebhook(payload: SentryWebhookPayload): NormalizedObservabilityEvent {
  const issue = payload.data.issue;

  return {
    provider: 'sentry',
    eventType: payload.action,
    title: issue.title,
    severity: mapSentryLevel(issue.level),
    occurredAt: new Date().toISOString(),
    frequency: Number(issue.count ?? 1),
    ...(issue.id ? { fingerprint: issue.id } : {}),
    metadata: {
      actor: payload.actor ?? null,
      culprit: issue.culprit ?? null,
      permalink: issue.permalink ?? null,
      projectName: issue.project?.name ?? null,
      shortId: issue.shortId ?? null,
      issueMetadata: issue.metadata ?? {}
    }
  };
}