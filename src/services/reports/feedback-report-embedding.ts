import { createHash } from 'node:crypto';

import type { StoredFeedbackReport } from '../../types/reports.js';

export interface FeedbackReportEmbeddingDraft {
  model: string;
  sourceText: string;
  embedding: number[];
}

const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_MODEL = 'deterministic-hash-v1';
const MAX_SOURCE_TEXT_LENGTH = 12_000;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function collectPayloadText(value: unknown, buffer: string[]): void {
  if (typeof value === 'string') {
    const normalized = normalizeWhitespace(value);
    if (normalized) {
      buffer.push(normalized);
    }
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    buffer.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPayloadText(item, buffer);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      buffer.push(key);
      collectPayloadText(nestedValue, buffer);
    }
  }
}

function buildSourceText(report: StoredFeedbackReport): string {
  const segments: string[] = [
    `source ${report.source}`,
    `severity ${report.severity}`
  ];

  if (report.title) {
    segments.push(`title ${normalizeWhitespace(report.title)}`);
  }

  if (report.reporterIdentifier) {
    segments.push(`reporter ${normalizeWhitespace(report.reporterIdentifier)}`);
  }

  if (report.externalId) {
    segments.push(`external ${normalizeWhitespace(report.externalId)}`);
  }

  const payloadSegments: string[] = [];
  collectPayloadText(report.payload, payloadSegments);
  if (payloadSegments.length > 0) {
    segments.push(`payload ${payloadSegments.join(' ')}`);
  }

  return normalizeWhitespace(segments.join(' ')).slice(0, MAX_SOURCE_TEXT_LENGTH);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function vectorizeText(value: string): number[] {
  const tokens = tokenize(value);
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const digest = hashToken(token);
    const bucket = digest.readUInt16BE(0) % EMBEDDING_DIMENSIONS;
    const direction = (digest.readUInt8(2) & 1) === 0 ? 1 : -1;
    const rawWeight = digest.readUInt16BE(3);
    const weight = 1 + (rawWeight / 65_535);
    vector[bucket] = (vector[bucket] ?? 0) + (direction * weight);
  }

  return normalizeVector(vector);
}

export function buildFeedbackReportEmbedding(report: StoredFeedbackReport): FeedbackReportEmbeddingDraft {
  const sourceText = buildSourceText(report);

  return {
    model: EMBEDDING_MODEL,
    sourceText,
    embedding: vectorizeText(sourceText)
  };
}