import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { buildLearnLandingPage, buildOnboardingConsolePage, buildReviewQueuePage, buildSupportOpsPage } from './learn-pages/index.js';

const learnPages = {
  '/learn/prd': {
    fileName: 'PRD.html',
    title: 'Interactive PRD'
  }
} as const;

async function readLearnPage(fileName: string): Promise<string> {
  return readFile(path.resolve(process.cwd(), fileName), 'utf8');
}

function logUnavailablePage(app: FastifyInstance, routePath: string, title: string, error: unknown): void {
  app.log.warn({ err: error, routePath, title }, 'learn page unavailable');
}

export function registerLearnRoutes(app: FastifyInstance): void {
  app.get('/learn', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return buildLearnLandingPage();
  });

  for (const [routePath, page] of Object.entries(learnPages)) {
    app.get(routePath, async (_request, reply) => {
      try {
        const html = await readLearnPage(page.fileName);
        reply.type('text/html; charset=utf-8');
        return html;
      } catch (error) {
        logUnavailablePage(app, routePath, page.title, error);
        throw app.httpErrors.notFound(`${page.title} page is not available`);
      }
    });
  }

  app.get('/learn/review-queue', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return buildReviewQueuePage();
  });

  app.get('/learn/support-ops', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return buildSupportOpsPage();
  });

  app.get('/learn/onboarding', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return buildOnboardingConsolePage();
  });
}
