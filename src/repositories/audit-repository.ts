import type { AuditEvent } from '../support/audit-log.js';
import type { DatabaseClient } from '../support/database.js';

export interface AuditRepository {
  create(id: string, event: AuditEvent): Promise<void>;
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
    }
  };
}