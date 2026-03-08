import type { FastifyBaseLogger } from 'fastify';
import { randomUUID } from 'node:crypto';

import type { AuditRepository } from '../repositories/audit-repository.js';

export interface AuditEvent {
  eventType: string;
  actorType: 'system' | 'user' | 'integration';
  actorId?: string;
  requestId?: string;
  payload: Record<string, unknown>;
}

export interface AuditLogger {
  write(event: AuditEvent): Promise<void>;
}

export function createAuditLogger(logger: FastifyBaseLogger, repository: AuditRepository): AuditLogger {
  return {
    async write(event) {
      const auditEventId = randomUUID();

      await repository.create(auditEventId, event);
      logger.info({
        auditEventId,
        ...event
      }, 'audit event');
    }
  };
}