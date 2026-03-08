import type { DatabaseClient } from '../support/database.js';
import type { StoredArtifactBundle } from '../types/artifacts.js';

export interface ArtifactBundleRepository {
  create(bundle: StoredArtifactBundle): Promise<void>;
  findById(id: string): Promise<StoredArtifactBundle | null>;
  findByReportId(reportId: string): Promise<StoredArtifactBundle[]>;
}

interface ArtifactBundleRow {
  id: string;
  feedback_report_id: string;
  artifact_type: StoredArtifactBundle['artifactType'];
  storage_key: string;
  metadata: Record<string, unknown>;
}

export function createArtifactBundleRepository(database: DatabaseClient): ArtifactBundleRepository {
  return {
    async create(bundle) {
      await database.query(
        `INSERT INTO artifact_bundles (
          id,
          feedback_report_id,
          artifact_type,
          storage_key,
          metadata
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          bundle.id,
          bundle.feedbackReportId,
          bundle.artifactType,
          bundle.storageKey,
          JSON.stringify(bundle.metadata)
        ]
      );
    },
    async findById(id) {
      const result = await database.query<ArtifactBundleRow>(
        `SELECT id, feedback_report_id, artifact_type, storage_key, metadata
         FROM artifact_bundles
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        feedbackReportId: row.feedback_report_id,
        artifactType: row.artifact_type,
        storageKey: row.storage_key,
        metadata: row.metadata
      };
    },
    async findByReportId(reportId) {
      const result = await database.query<ArtifactBundleRow>(
        `SELECT id, feedback_report_id, artifact_type, storage_key, metadata
         FROM artifact_bundles
         WHERE feedback_report_id = $1
         ORDER BY created_at ASC`,
        [reportId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        feedbackReportId: row.feedback_report_id,
        artifactType: row.artifact_type,
        storageKey: row.storage_key,
        metadata: row.metadata
      }));
    }
  };
}