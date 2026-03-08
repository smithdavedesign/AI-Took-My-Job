import type { StoredFeedbackReport } from '../../types/reports.js';

export interface ReportClassification {
  primaryIntent: 'incident' | 'bug-report' | 'regression' | 'performance' | 'stability';
  confidence: number;
  normalizedTitle: string;
  labels: string[];
  areaHints: string[];
  reasons: string[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value: string | undefined): string {
  if (!value) {
    return 'untitled report';
  }

  return normalizeWhitespace(value.toLowerCase().replace(/[^a-z0-9\s:/_-]+/g, ' '));
}

function readAreaHints(report: StoredFeedbackReport): string[] {
  const payload = report.payload;
  const candidates = [
    typeof payload.pageUrl === 'string' ? payload.pageUrl : null,
    typeof payload.condition_name === 'string' ? payload.condition_name : null,
    typeof payload.policy_name === 'string' ? payload.policy_name : null,
    typeof payload.title === 'string' ? payload.title : null,
    typeof payload.environment === 'string' ? payload.environment : null,
    typeof report.title === 'string' ? report.title : null
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates.map((value) => normalizeWhitespace(value)).filter((value) => value.length > 0))].slice(0, 5);
}

export function classifyReport(report: StoredFeedbackReport): ReportClassification {
  const normalizedTitle = normalizeTitle(report.title);
  const payloadText = JSON.stringify(report.payload).toLowerCase();
  const reasons: string[] = [];
  const labels = new Set<string>([`source:${report.source}`]);

  let primaryIntent: ReportClassification['primaryIntent'] = report.source === 'extension' ? 'bug-report' : 'incident';
  let confidence = report.source === 'extension' ? 0.72 : 0.8;

  if (/(latency|slow|timeout|p95|performance)/i.test(normalizedTitle) || /(latency|slow|timeout|p95|performance)/i.test(payloadText)) {
    primaryIntent = 'performance';
    confidence = Math.max(confidence, 0.84);
    reasons.push('performance-related terms detected in title or payload');
    labels.add('intent:performance');
  }

  if (/(regression|again|repro|reproduced|repeat)/i.test(normalizedTitle) || /(regression|repeat|same issue)/i.test(payloadText)) {
    primaryIntent = 'regression';
    confidence = Math.max(confidence, 0.82);
    reasons.push('regression hints detected in title or payload');
    labels.add('intent:regression');
  }

  if (/(error|exception|incident|outage|failed|failure)/i.test(normalizedTitle) || /(error|exception|incident|failed|failure)/i.test(payloadText)) {
    primaryIntent = report.source === 'extension' ? 'bug-report' : 'incident';
    confidence = Math.max(confidence, 0.86);
    reasons.push('failure terms detected in title or payload');
    labels.add('intent:incident');
  }

  if (report.source === 'extension') {
    labels.add('intent:bug-report');
    reasons.push('browser extension report implies user-observed bug context');
  }

  if (report.severity === 'critical' || report.severity === 'high') {
    labels.add('priority:high-signal');
    reasons.push(`severity ${report.severity} increases classification confidence`);
    confidence = Math.min(0.98, confidence + 0.04);
  }

  if (reasons.length === 0) {
    reasons.push('default deterministic source and severity classification applied');
  }

  return {
    primaryIntent,
    confidence: Number(confidence.toFixed(4)),
    normalizedTitle,
    labels: [...labels],
    areaHints: readAreaHints(report),
    reasons
  };
}