import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

import { buildLearnLandingPage, buildOnboardingConsolePage, buildReviewQueuePage, buildSupportOpsPage } from './learn-pages/index.js';
import { requireOperatorUiAccess } from '../support/operator-session.js';

const learnPages = {
  '/learn/prd': {
    fileName: 'PRD.html',
    title: 'Interactive PRD'
  }
} as const;

async function readLearnPage(fileName: string): Promise<string> {
  return readFile(path.resolve(process.cwd(), fileName), 'utf8');
}

function applyLearnPageHeaders(reply: { type: (value: string) => unknown; header: (name: string, value: string) => unknown }): void {
  reply.type('text/html; charset=utf-8');
  reply.header('content-security-policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' http: https:; font-src 'self' data: https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
}

function logUnavailablePage(app: FastifyInstance, routePath: string, title: string, error: unknown): void {
  app.log.warn({ err: error, routePath, title }, 'learn page unavailable');
}

export function registerLearnRoutes(app: FastifyInstance): void {
  app.get('/learn', async (request, reply) => {
    if (!requireOperatorUiAccess(app, request, reply)) {
      return;
    }
    applyLearnPageHeaders(reply);
    return buildLearnLandingPage();
  });

  for (const [routePath, page] of Object.entries(learnPages)) {
    app.get(routePath, async (request, reply) => {
      if (!requireOperatorUiAccess(app, request, reply)) {
        return;
      }
      try {
        const html = await readLearnPage(page.fileName);
        applyLearnPageHeaders(reply);
        return html;
      } catch (error) {
        logUnavailablePage(app, routePath, page.title, error);
        throw app.httpErrors.notFound(`${page.title} page is not available`);
      }
    });
  }

  app.get('/learn/review-queue', async (request, reply) => {
    if (!requireOperatorUiAccess(app, request, reply)) {
      return;
    }
    applyLearnPageHeaders(reply);
    return buildReviewQueuePage();
  });

  app.get('/learn/support-ops', async (request, reply) => {
    if (!requireOperatorUiAccess(app, request, reply)) {
      return;
    }
    applyLearnPageHeaders(reply);
    return buildSupportOpsPage();
  });

  app.get('/learn/onboarding', async (request, reply) => {
    if (!requireOperatorUiAccess(app, request, reply)) {
      return;
    }
    applyLearnPageHeaders(reply);
    return buildOnboardingConsolePage();
  });
}
