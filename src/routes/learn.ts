import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';

const learnPages = {
  '/learn/prd': {
    fileName: 'PRD.html',
    title: 'Interactive PRD'
  },
  '/learn/developer-workbench': {
    fileName: 'PRD-Design-Dev-Workbench.html',
    title: 'Developer Workbench Preview'
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

    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      '  <title>Nexus Learn More</title>',
      '  <style>',
      '    :root { color-scheme: light; --bg: #f4efe7; --ink: #1e2430; --card: rgba(255,255,255,0.82); --accent: #0b6e4f; --accent-soft: #d7efe6; }',
      '    * { box-sizing: border-box; }',
      '    body { margin: 0; font-family: Georgia, "Iowan Old Style", serif; background: radial-gradient(circle at top, #fff9ef 0%, var(--bg) 52%, #e4dccf 100%); color: var(--ink); }',
      '    main { max-width: 960px; margin: 0 auto; padding: 72px 24px 96px; }',
      '    h1 { font-size: clamp(2.6rem, 7vw, 5rem); line-height: 0.95; margin: 0 0 16px; }',
      '    p { max-width: 60ch; font-size: 1.08rem; line-height: 1.6; }',
      '    .grid { display: grid; gap: 18px; margin-top: 36px; }',
      '    .card { display: block; text-decoration: none; color: inherit; background: var(--card); border: 1px solid rgba(30,36,48,0.1); border-radius: 22px; padding: 24px; box-shadow: 0 20px 45px rgba(30,36,48,0.08); transition: transform 180ms ease, box-shadow 180ms ease; }',
      '    .card:hover { transform: translateY(-3px); box-shadow: 0 24px 54px rgba(30,36,48,0.12); }',
      '    .eyebrow { display: inline-block; font: 600 0.78rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); background: var(--accent-soft); padding: 8px 10px; border-radius: 999px; }',
      '    .title { display: block; font-size: 1.6rem; margin: 14px 0 8px; }',
      '    .hint { color: rgba(30,36,48,0.74); }',
      '  </style>',
      '</head>',
      '<body>',
      '  <main>',
      '    <span class="eyebrow">Nexus Learn More</span>',
      '    <h1>Explore the product story and developer workbench.</h1>',
      '    <p>These pages are hosted directly from the gateway so prospective users and contributors can review the product rationale and the Phase 7 developer experience without cloning the repo first.</p>',
      '    <section class="grid">',
      '      <a class="card" href="/learn/prd">',
      '        <span class="title">Interactive PRD</span>',
      '        <span class="hint">Product narrative, scope, and operating model.</span>',
      '      </a>',
      '      <a class="card" href="/learn/developer-workbench">',
      '        <span class="title">Developer Workbench Preview</span>',
      '        <span class="hint">Phase 7+ design concepts for MCP-assisted triage and repair.</span>',
      '      </a>',
      '    </section>',
      '  </main>',
      '</body>',
      '</html>'
    ].join('\n');
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
}