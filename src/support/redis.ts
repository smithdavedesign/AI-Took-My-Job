import { Redis } from 'ioredis';

export interface BullConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
}

export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });
}

export function createBullConnectionOptions(redisUrl: string): BullConnectionOptions {
  const parsed = new URL(redisUrl);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined;

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: parsed.username } : {}),
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(typeof db === 'number' && !Number.isNaN(db) ? { db } : {})
  };
}