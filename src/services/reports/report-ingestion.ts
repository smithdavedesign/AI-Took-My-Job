import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { redactPayload } from '../redaction/payload-redactor.js';
import { buildFeedbackReportEmbedding } from './feedback-report-embedding.js';
import type { StoredFeedbackReport } from '../../types/reports.js';

export interface IngestFeedbackReportInput {
  projectId?: string;
  source: StoredFeedbackReport['source'];
  externalId?: string;
  title?: string;
  severity: StoredFeedbackReport['severity'];
  reporterIdentifier?: string;
  payload: Record<string, unknown>;
  triagePriority: number;
}

export interface IngestFeedbackReportResult {
  report: StoredFeedbackReport;
  triageJobId: string;
  redactionCount: number;
  triagePriority: number;
}

export async function ingestFeedbackReport(app: FastifyInstance, input: IngestFeedbackReportInput): Promise<IngestFeedbackReportResult> {
  const reportId = randomUUID();
  const sanitized = redactPayload(input.payload);
  const report: StoredFeedbackReport = {
    id: reportId,
    source: input.source,
    status: 'received',
    severity: input.severity,
    payload: {
      ...sanitized.value,
      redactionCount: sanitized.redactionCount
    },
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.externalId ? { externalId: input.externalId } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.reporterIdentifier ? { reporterIdentifier: input.reporterIdentifier } : {})
  };

  await app.reports.create(report);
  await app.reportEmbeddings.upsert({
    id: report.id,
    feedbackReportId: report.id,
    ...buildFeedbackReportEmbedding(report)
  });

  const queueResult = await app.jobs.enqueue({
    type: 'triage',
    reportId: report.id,
    source: report.source,
    priority: input.triagePriority,
    payload: report.payload
  });

  return {
    report,
    triageJobId: queueResult.jobId,
    redactionCount: sanitized.redactionCount,
    triagePriority: input.triagePriority
  };
}