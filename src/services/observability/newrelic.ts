import type { FeedbackSource } from '../../types/reports.js';

export interface NewRelicWebhookPayload {
  incident_id: string | number;
  event?: string;
  severity?: 'critical' | 'warning' | 'info';
  title?: string;
  condition_name?: string;
  policy_name?: string;
  incident_url?: string;
  owner?: string;
  details?: Record<string, unknown>;
  timestamp?: number | string;
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

function mapNewRelicSeverity(severity?: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'medium';
    case 'info':
    default:
      return 'low';
  }
}

function normalizeOccurredAt(value?: number | string): string {
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }

  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }

    const asNumber = Number(value);
    if (!Number.isNaN(asNumber)) {
      return new Date(asNumber).toISOString();
    }
  }

  return new Date().toISOString();
}

export function normalizeNewRelicWebhook(payload: NewRelicWebhookPayload): NormalizedObservabilityEvent {
  const title = payload.title ?? payload.condition_name ?? `New Relic incident ${payload.incident_id}`;

  return {
    provider: 'newrelic',
    eventType: payload.event ?? 'incident',
    title,
    severity: mapNewRelicSeverity(payload.severity),
    fingerprint: String(payload.incident_id),
    occurredAt: normalizeOccurredAt(payload.timestamp),
    frequency: 1,
    metadata: {
      conditionName: payload.condition_name ?? null,
      policyName: payload.policy_name ?? null,
      incidentUrl: payload.incident_url ?? null,
      owner: payload.owner ?? null,
      details: payload.details ?? {}
    }
  };
}