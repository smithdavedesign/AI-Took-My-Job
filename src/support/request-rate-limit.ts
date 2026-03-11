import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface RateLimitOptions {
  bucket: string;
  max: number;
  windowSeconds: number;
  keyParts: Array<string | number | null | undefined>;
}

function normalizePart(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'none';
  }

  return String(value).replace(/[^a-zA-Z0-9:_-]/g, '_');
}

export async function enforceRequestRateLimit(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  options: RateLimitOptions
): Promise<void> {
  const key = `rate-limit:${options.bucket}:${options.keyParts.map(normalizePart).join(':')}`;
  const currentCount = await app.redis.incr(key);
  let ttlSeconds = await app.redis.ttl(key);

  if (currentCount === 1 || ttlSeconds < 0) {
    await app.redis.expire(key, options.windowSeconds);
    ttlSeconds = options.windowSeconds;
  }

  reply.header('x-ratelimit-limit', String(options.max));
  reply.header('x-ratelimit-remaining', String(Math.max(0, options.max - currentCount)));
  reply.header('x-ratelimit-reset', String(Math.max(0, ttlSeconds)));

  if (currentCount > options.max) {
    reply.header('retry-after', String(Math.max(1, ttlSeconds)));
    request.log.warn({
      bucket: options.bucket,
      requestId: request.id,
      sourceIp: request.ip,
      limit: options.max,
      windowSeconds: options.windowSeconds,
      key
    }, 'request rate limit exceeded');
    throw app.httpErrors.tooManyRequests('rate limit exceeded');
  }
}