import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  authenticateOperatorCredentials,
  clearOperatorSessionCookie,
  getOperatorSessionStatus,
  isOperatorAuthEnabled,
  sanitizeNextPath,
  setOperatorSessionCookie
} from '../support/operator-session.js';

const loginQuerySchema = z.object({
  next: z.string().optional()
});

const loginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  next: z.string().optional()
});

function applyOperatorPageHeaders(reply: { type: (value: string) => unknown; header: (name: string, value: string) => unknown }): void {
  reply.type('text/html; charset=utf-8');
  reply.header('content-security-policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data: https:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
  reply.header('cache-control', 'no-store');
  reply.header('x-robots-tag', 'noindex, nofollow');
}

function buildOperatorLoginPage(nextPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nexus Operator Login</title>
  <style>
    :root { color-scheme: light; --bg-top: #f8f1de; --bg-bottom: #d4e0dc; --ink: #18212b; --muted: rgba(24,33,43,0.72); --panel: rgba(255,255,255,0.9); --line: rgba(24,33,43,0.12); --accent: #0d5e55; --shadow: 0 24px 64px rgba(24,33,43,0.12); }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font-family: "Avenir Next", "Segoe UI", sans-serif; background: radial-gradient(circle at top left, #fff8ec 0%, var(--bg-top) 42%, var(--bg-bottom) 100%); color: var(--ink); }
    .panel { width: min(460px, 100%); background: var(--panel); border: 1px solid var(--line); border-radius: 28px; box-shadow: var(--shadow); padding: 28px; display: grid; gap: 14px; }
    h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.3rem); line-height: 0.95; }
    p { margin: 0; color: var(--muted); line-height: 1.6; }
    label { display: grid; gap: 6px; color: var(--muted); font-size: 0.92rem; }
    input, button { font: inherit; }
    input { width: 100%; border: 1px solid var(--line); border-radius: 14px; padding: 11px 12px; }
    button { border: none; border-radius: 14px; padding: 12px 14px; background: var(--accent); color: #fff; cursor: pointer; }
    .error { color: #922f2f; min-height: 1.25rem; }
    .eyebrow { display: inline-flex; width: fit-content; padding: 8px 10px; border-radius: 999px; background: rgba(13,94,85,0.12); color: var(--accent); font: 700 0.76rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; }
  </style>
</head>
<body>
  <main class="panel">
    <span class="eyebrow">Operator Access</span>
    <h1>Sign in to Nexus.</h1>
    <p>Hosted operator routes are protected by an operator session. Sign in once, then the learn surfaces and internal operator APIs will use the same secure cookie.</p>
    <label>Username<input id="username" autocomplete="username" /></label>
    <label>Password<input id="password" type="password" autocomplete="current-password" /></label>
    <input id="next" type="hidden" value="${nextPath}" />
    <button id="submit" type="button">Sign In</button>
    <div id="error" class="error"></div>
  </main>
  <script>
    document.getElementById('submit').addEventListener('click', async () => {
      const error = document.getElementById('error');
      error.textContent = '';
      const response = await fetch('/operator/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: document.getElementById('password').value,
          next: document.getElementById('next').value
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        error.textContent = payload.message || 'Failed to sign in.';
        return;
      }
      window.location.assign(payload.next || '/learn');
    });
  </script>
</body>
</html>`;
}

export function registerOperatorRoutes(app: FastifyInstance): void {
  app.get('/operator/login', async (request, reply) => {
    if (!isOperatorAuthEnabled(app.config)) {
      void reply.redirect('/learn');
      return;
    }

    const status = getOperatorSessionStatus(request, app.config);
    const query = loginQuerySchema.parse(request.query);
    const nextPath = sanitizeNextPath(query.next);
    if (status.authenticated) {
      void reply.redirect(nextPath);
      return;
    }

    applyOperatorPageHeaders(reply);
    return buildOperatorLoginPage(nextPath);
  });

  app.get('/operator/session', async (request) => {
    const status = getOperatorSessionStatus(request, app.config);
    return status;
  });

  app.post('/operator/session', async (request, reply) => {
    if (!isOperatorAuthEnabled(app.config)) {
      throw app.httpErrors.notFound('operator authentication is not configured');
    }

    const body = loginBodySchema.parse(request.body);
    const nextPath = sanitizeNextPath(body.next);
    if (!authenticateOperatorCredentials(app.config, body.username, body.password)) {
      throw app.httpErrors.unauthorized('invalid operator credentials');
    }

    setOperatorSessionCookie(reply, app.config, body.username);
    return {
      ok: true,
      next: nextPath
    };
  });

  app.post('/operator/logout', async (_request, reply) => {
    clearOperatorSessionCookie(reply, app.config);
    return {
      ok: true
    };
  });
}