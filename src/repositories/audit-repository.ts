import type { AuditEvent } from '../support/audit-log.js';
import type { DatabaseClient } from '../support/database.js';

export interface StoredAuditEvent {
  id: string;
  eventType: string;
  actorType: AuditEvent['actorType'];
  actorId?: string;
  requestId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AuditRepository {
  create(id: string, event: AuditEvent): Promise<void>;
  listByReportId(reportId: string, limit?: number): Promise<StoredAuditEvent[]>;
}

interface AuditEventRow {
  id: string;
  event_type: string;
  actor_type: AuditEvent['actorType'];
  actor_id: string | null;
  request_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

function mapRow(row: AuditEventRow): StoredAuditEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    actorType: row.actor_type,
    payload: row.payload,
    createdAt: row.created_at,
    ...(row.actor_id ? { actorId: row.actor_id } : {}),
    ...(row.request_id ? { requestId: row.request_id } : {})
  };
}

export function createAuditRepository(database: DatabaseClient): AuditRepository {
  return {
    async create(id, event) {
      await database.query(
        `INSERT INTO audit_events (
          id,
          event_type,
          actor_type,
          actor_id,
          request_id,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          event.eventType,
          event.actorType,
          event.actorId ?? null,
          event.requestId ?? null,
          JSON.stringify(event.payload)
        ]
      );
    },
    async listByReportId(reportId, limit = 50) {
      const result = await database.query<AuditEventRow>(
        `SELECT id, event_type, actor_type, actor_id, request_id, payload, created_at
         FROM audit_events
         WHERE payload->>'reportId' = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [reportId, limit]
      );

      return result.rows.map(mapRow);
    }
  };
}