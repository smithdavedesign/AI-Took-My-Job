import type { DatabaseClient } from '../support/database.js';

export interface StoredFeedbackReportEmbedding {
  id: string;
  feedbackReportId: string;
  model: string;
  sourceText: string;
  embedding: number[];
}

export interface FeedbackReportEmbeddingRepository {
  upsert(embedding: StoredFeedbackReportEmbedding): Promise<void>;
  findByReportId(reportId: string): Promise<StoredFeedbackReportEmbedding | null>;
  findNearestNeighbors(embedding: number[], limit?: number): Promise<Array<{ feedbackReportId: string; distance: number }>>;
}

interface FeedbackReportEmbeddingRow {
  id: string;
  feedback_report_id: string;
  model: string;
  source_text: string;
  embedding: string;
}

function parseVectorLiteral(value: string): number[] {
  const normalized = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!normalized) {
    return [];
  }

  return normalized.split(',').map((entry) => Number(entry.trim()));
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export function createFeedbackReportEmbeddingRepository(database: DatabaseClient): FeedbackReportEmbeddingRepository {
  return {
    async upsert(embedding) {
      await database.query(
        `INSERT INTO feedback_report_embeddings (
          id,
          feedback_report_id,
          model,
          source_text,
          embedding
        ) VALUES ($1, $2, $3, $4, $5::vector)
        ON CONFLICT (feedback_report_id)
        DO UPDATE SET
          model = EXCLUDED.model,
          source_text = EXCLUDED.source_text,
          embedding = EXCLUDED.embedding,
          updated_at = NOW()`,
        [
          embedding.id,
          embedding.feedbackReportId,
          embedding.model,
          embedding.sourceText,
          toVectorLiteral(embedding.embedding)
        ]
      );
    },
    async findByReportId(reportId) {
      const result = await database.query<FeedbackReportEmbeddingRow>(
        `SELECT id, feedback_report_id, model, source_text, embedding::text AS embedding
         FROM feedback_report_embeddings
         WHERE feedback_report_id = $1`,
        [reportId]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        feedbackReportId: row.feedback_report_id,
        model: row.model,
        sourceText: row.source_text,
        embedding: parseVectorLiteral(row.embedding)
      };
    },
    async findNearestNeighbors(embedding, limit = 5) {
      const result = await database.query<{ feedback_report_id: string; distance: number }>(
        `SELECT feedback_report_id, embedding <-> $1::vector AS distance
         FROM feedback_report_embeddings
         ORDER BY embedding <-> $1::vector ASC
         LIMIT $2`,
        [toVectorLiteral(embedding), limit]
      );

      return result.rows.map((row) => ({
        feedbackReportId: row.feedback_report_id,
        distance: Number(row.distance)
      }));
    }
  };
}