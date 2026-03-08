import type { StoredFeedbackReport } from '../../types/reports.js';

const filePathPattern = /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+/g;

export interface ReportIndex {
  services: string[];
  filePaths: string[];
  keywords: string[];
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().toLowerCase();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return JSON.stringify(value).toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))).sort();
}

function readValueAtPath(record: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = record;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function extractFilePaths(values: string[]): string[] {
  const matches: string[] = [];

  for (const value of values) {
    for (const match of value.matchAll(filePathPattern)) {
      if (typeof match[0] === 'string') {
        matches.push(match[0]);
      }
    }
  }

  return uniqueSorted(matches);
}

function extractKeywords(values: string[]): string[] {
  const tokens: string[] = [];

  for (const value of values) {
    for (const token of value.split(/[^a-z0-9_.\/-]+/i)) {
      if (token.length >= 4 && !token.includes('/')) {
        tokens.push(token);
      }
    }
  }

  return uniqueSorted(tokens).slice(0, 50);
}

export function buildReportIndex(report: Pick<StoredFeedbackReport, 'title' | 'reporterIdentifier' | 'payload'>): ReportIndex {
  const payload = report.payload;
  const serviceCandidates = [
    report.reporterIdentifier,
    typeof payload.owner === 'string' ? payload.owner : undefined,
    typeof payload.service === 'string' ? payload.service : undefined,
    typeof readValueAtPath(payload, ['metadata', 'owner']) === 'string' ? readValueAtPath(payload, ['metadata', 'owner']) as string : undefined,
    typeof readValueAtPath(payload, ['metadata', 'service']) === 'string' ? readValueAtPath(payload, ['metadata', 'service']) as string : undefined,
    typeof readValueAtPath(payload, ['details', 'service']) === 'string' ? readValueAtPath(payload, ['details', 'service']) as string : undefined
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const normalizedTextValues = [
    normalizeText(report.title),
    normalizeText(payload),
    ...serviceCandidates.map((value) => normalizeText(value))
  ].filter((value) => value.length > 0);

  return {
    services: uniqueSorted(serviceCandidates),
    filePaths: extractFilePaths(normalizedTextValues),
    keywords: extractKeywords(normalizedTextValues)
  };
}

export function readPersistedReportIndex(payload: Record<string, unknown>): ReportIndex | null {
  const value = payload.reportIndex;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const services = Array.isArray(record.services) ? record.services.filter((item): item is string => typeof item === 'string') : [];
  const filePaths = Array.isArray(record.filePaths) ? record.filePaths.filter((item): item is string => typeof item === 'string') : [];
  const keywords = Array.isArray(record.keywords) ? record.keywords.filter((item): item is string => typeof item === 'string') : [];

  return {
    services: uniqueSorted(services),
    filePaths: uniqueSorted(filePaths),
    keywords: uniqueSorted(keywords)
  };
}