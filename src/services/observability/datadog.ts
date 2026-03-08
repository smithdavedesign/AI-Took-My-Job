import type { FeedbackSource } from '../../types/reports.js';

export interface DatadogWebhookPayload {
  id: string | number;
  title: string;
  text?: string;
  alert_type?: 'info' | 'warning' | 'error' | 'success';
  event_type?: string;
  date_happened?: string | number;
  priority?: string;
  tags?: string[];
  url?: string;
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

function mapDatadogSeverity(alertType?: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (alertType) {
    case 'error':
      return 'high';
    case 'warning':
      return 'medium';
    case 'success':
    case 'info':
    default:
      return 'low';
  }
}

function normalizeOccurredAt(value?: string | number): string {
  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === 'string' && value.length > 0) {
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber)) {
      return new Date(asNumber * 1000).toISOString();
    }
  }

  return new Date().toISOString();
}

export function normalizeDatadogWebhook(payload: DatadogWebhookPayload): NormalizedObservabilityEvent {
  return {
    provider: 'datadog',
    eventType: payload.event_type ?? 'monitor_alert',
    title: payload.title,
    severity: mapDatadogSeverity(payload.alert_type),
    fingerprint: String(payload.id),
    occurredAt: normalizeOccurredAt(payload.date_happened),
    frequency: Math.max(payload.tags?.length ?? 1, 1),
    metadata: {
      alertType: payload.alert_type ?? null,
      priority: payload.priority ?? null,
      text: payload.text ?? null,
      tags: payload.tags ?? [],
      url: payload.url ?? null
    }
  };
}