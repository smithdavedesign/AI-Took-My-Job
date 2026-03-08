import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { computeInitialImpactScore } from '../../domain/impact-score.js';
import {
  capturedArtifactEnvelopeSchema,
  normalizeCapturedUploads,
  persistCapturedArtifacts,
  summarizeUploads,
  validateUploadBudgets
} from '../../services/reports/captured-feedback.js';
import { ingestFeedbackReport } from '../../services/reports/report-ingestion.js';

const projectKeyParamsSchema = z.object({
  projectKey: z.string().min(3).max(80)
});

const widgetQuerySchema = z.object({
  embed: z.coerce.boolean().optional()
});

const publicFeedbackSchema = z.object({
  sessionId: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000).optional(),
  pageUrl: z.url(),
  environment: z.enum(['local', 'development', 'staging', 'production']).default('production'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  reporter: z.object({
    id: z.string().min(1).max(120).optional(),
    name: z.string().min(1).max(120).optional(),
    email: z.email().optional(),
    role: z.enum(['end-user', 'support', 'qa', 'po', 'developer']).default('end-user')
  }).default({ role: 'end-user' }),
  signals: z.object({
    consoleErrorCount: z.number().int().min(0).default(0),
    networkErrorCount: z.number().int().min(0).default(0),
    stakeholderCount: z.number().int().min(1).default(1)
  }).default({ consoleErrorCount: 0, networkErrorCount: 0, stakeholderCount: 1 }),
  labels: z.array(z.string().min(1).max(64)).max(20).optional(),
  notes: z.string().max(5000).optional(),
  artifacts: capturedArtifactEnvelopeSchema.default({
    hasScreenRecording: false,
    hasHar: false,
    hasConsoleLogs: false,
    hasLocalStorageSnapshot: false,
    hasSessionStorageSnapshot: false
  })
});

function resolveReporterIdentifier(reporter: z.infer<typeof publicFeedbackSchema>['reporter']): string {
  return reporter.email ?? reporter.id ?? reporter.name ?? 'anonymous';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildHostedFeedbackWidgetPage(project: { id: string; projectKey: string; name: string }, options: { embedded?: boolean } = {}): string {
  const projectName = escapeHtml(project.name);
  const projectKey = escapeHtml(project.projectKey);
  const embedded = options.embedded === true;

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${projectName} Feedback</title>`,
    '  <style>',
    '    :root { color-scheme: light; --ink: #13212f; --muted: rgba(19,33,47,0.7); --panel: rgba(255,255,255,0.86); --line: rgba(19,33,47,0.14); --accent: #bf5a2a; --accent-dark: #8e3c16; --accent-soft: rgba(191,90,42,0.14); --shadow: 0 24px 60px rgba(19,33,47,0.14); --good: #0d7344; --bad: #a3362f; }',
    '    * { box-sizing: border-box; }',
    `    body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; color: var(--ink); background: ${embedded ? 'linear-gradient(180deg, #fff8ee 0%, #f5ede3 100%)' : 'radial-gradient(circle at top, #fff6e8 0%, #f4ecdc 34%, #d8e4ea 100%)'}; }`,
    '    main { max-width: 1120px; margin: 0 auto; padding: 28px 18px 44px; }',
    '    .hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr); gap: 18px; margin-bottom: 18px; }',
    '    .panel { background: var(--panel); border: 1px solid rgba(255,255,255,0.55); border-radius: 28px; box-shadow: var(--shadow); overflow: hidden; backdrop-filter: blur(10px); }',
    '    .hero-copy { padding: 26px; }',
    '    .eyebrow { display: inline-flex; padding: 8px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-dark); font: 700 0.74rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; }',
    '    h1 { margin: 16px 0 10px; font-size: clamp(2.6rem, 7vw, 4.8rem); line-height: 0.92; max-width: 11ch; }',
    '    p { margin: 0; max-width: 64ch; color: var(--muted); line-height: 1.65; }',
    '    .hero-meta { display: grid; gap: 12px; padding: 26px; background: linear-gradient(180deg, rgba(19,33,47,0.95), rgba(34,54,69,0.92)); color: #f9f2e7; }',
    '    .hero-meta strong { display: block; font-size: 0.84rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(249,242,231,0.64); }',
    '    .hero-meta span { display: block; margin-top: 4px; font-size: 1.2rem; }',
    '    .layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.9fr); gap: 18px; }',
    '    form { padding: 22px; display: grid; gap: 18px; }',
    '    .grid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }',
    '    label { display: grid; gap: 8px; font-size: 0.92rem; color: var(--muted); }',
    '    input, textarea, select, button { font: inherit; }',
    '    input, textarea, select { width: 100%; border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; background: rgba(255,255,255,0.94); color: var(--ink); }',
    '    textarea { min-height: 120px; resize: vertical; }',
    '    .fieldset { border: 1px solid var(--line); border-radius: 22px; padding: 16px; display: grid; gap: 14px; background: rgba(255,255,255,0.55); }',
    '    .fieldset-title { margin: 0; font: 700 0.8rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }',
    '    .helper { color: var(--muted); font-size: 0.88rem; line-height: 1.5; }',
    '    .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }',
    '    button { border: none; border-radius: 16px; padding: 13px 16px; cursor: pointer; transition: transform 140ms ease, opacity 140ms ease; }',
    '    button:hover { transform: translateY(-1px); }',
    '    button.primary { background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: #fff7ef; }',
    '    button.secondary { background: rgba(255,255,255,0.85); border: 1px solid var(--line); color: var(--ink); }',
    '    button:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }',
    '    .status { padding: 14px 16px; border-top: 1px solid var(--line); background: rgba(19,33,47,0.04); color: var(--muted); min-height: 56px; }',
    '    .aside { padding: 22px; display: grid; gap: 16px; }',
    '    .card { border: 1px solid var(--line); border-radius: 22px; padding: 16px; background: rgba(255,255,255,0.62); }',
    '    .card h2 { margin: 0 0 10px; font-size: 1rem; }',
    '    .artifact-list { display: grid; gap: 10px; }',
    '    .artifact-row { border: 1px dashed var(--line); border-radius: 16px; padding: 12px; }',
    '    .success { color: var(--good); }',
    '    .error { color: var(--bad); }',
    '    pre { margin: 0; padding: 14px; border-radius: 16px; background: #1f2329; color: #f2efe8; overflow: auto; font: 0.82rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }',
    '    .embed-shell { display: flex; justify-content: flex-end; margin-bottom: 10px; }',
    '    .embed-close { border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,0.92); color: var(--ink); padding: 8px 12px; cursor: pointer; }',
    '    @media (max-width: 980px) { .hero, .layout, .grid { grid-template-columns: 1fr; } main { padding-inline: 12px; } }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    embedded ? '    <div class="embed-shell"><button id="closeEmbed" class="embed-close" type="button">Close</button></div>' : '',
    '    <section class="hero">',
    '      <article class="panel hero-copy">',
    '        <span class="eyebrow">Hosted Feedback</span>',
    `        <h1>${projectName}</h1>`,
    '        <p>Capture customer feedback while the session is still fresh. This form sends the report into the same project-scoped intake pipeline as the API, then routes it into the hosted-feedback review queue before any GitHub issue is created.</p>',
    '      </article>',
    '      <aside class="panel hero-meta">',
    '        <div><strong>Project Key</strong><span id="projectKeyDisplay"></span></div>',
    '        <div><strong>Submission Path</strong><span id="submissionPath"></span></div>',
    '        <div><strong>Review Policy</strong><span>Human approval required before GitHub sync</span></div>',
    '      </aside>',
    '    </section>',
    '    <section class="layout">',
    '      <article class="panel">',
    '        <form id="feedbackForm">',
    '          <div class="grid">',
    '            <label>Title<input id="title" name="title" maxlength="200" required placeholder="Checkout blocked after coupon apply" /></label>',
    '            <label>Page URL<input id="pageUrl" name="pageUrl" type="url" required placeholder="https://app.example.com/checkout" /></label>',
    '          </div>',
    '          <label>Description<textarea id="description" name="description" maxlength="5000" placeholder="What happened, what should have happened, and what the customer tried."></textarea></label>',
    '          <div class="grid">',
    '            <label>Severity<select id="severity" name="severity"><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option><option value="low">Low</option></select></label>',
    '            <label>Environment<select id="environment" name="environment"><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option><option value="local">Local</option></select></label>',
    '          </div>',
    '          <div class="fieldset">',
    '            <h2 class="fieldset-title">Reporter</h2>',
    '            <div class="grid">',
    '              <label>Name<input id="reporterName" name="reporterName" maxlength="120" placeholder="Jamie Support" /></label>',
    '              <label>Email<input id="reporterEmail" name="reporterEmail" type="email" placeholder="jamie@example.com" /></label>',
    '              <label>Reporter ID<input id="reporterId" name="reporterId" maxlength="120" placeholder="cust-482" /></label>',
    '              <label>Role<select id="reporterRole" name="reporterRole"><option value="end-user">End user</option><option value="support">Support</option><option value="qa">QA</option><option value="po">PO</option><option value="developer">Developer</option></select></label>',
    '            </div>',
    '          </div>',
    '          <div class="fieldset">',
    '            <h2 class="fieldset-title">Signals</h2>',
    '            <div class="grid">',
    '              <label>Console Errors<input id="consoleErrorCount" name="consoleErrorCount" type="number" min="0" value="0" /></label>',
    '              <label>Network Errors<input id="networkErrorCount" name="networkErrorCount" type="number" min="0" value="0" /></label>',
    '              <label>Impacted Stakeholders<input id="stakeholderCount" name="stakeholderCount" type="number" min="1" value="1" /></label>',
    '              <label>Labels<input id="labels" name="labels" placeholder="checkout, payments, promo-code" /></label>',
    '            </div>',
    '            <label>Operator Notes<textarea id="notes" name="notes" maxlength="5000" placeholder="Optional internal notes, customer quotes, or support context."></textarea></label>',
    '          </div>',
    '          <div class="fieldset">',
    '            <h2 class="fieldset-title">Inline Evidence</h2>',
    '            <div class="artifact-list">',
    '              <div class="artifact-row"><label>Console Logs JSON or TXT<input id="consoleLogsFile" type="file" accept=".json,.txt,.log,text/plain,application/json" /></label></div>',
    '              <div class="artifact-row"><label>HAR File<input id="harFile" type="file" accept=".har,.json,application/json" /></label></div>',
    '              <div class="artifact-row"><label>Local Storage Snapshot JSON<input id="localStorageFile" type="file" accept=".json,application/json" /></label></div>',
    '              <div class="artifact-row"><label>Session Storage Snapshot JSON<input id="sessionStorageFile" type="file" accept=".json,application/json" /></label></div>',
    '              <div class="artifact-row"><label>Screen Recording<input id="screenRecordingFile" type="file" accept="video/*,.webm,.mp4" /></label></div>',
    '            </div>',
    '            <div class="helper">Files are base64-encoded in the browser and submitted through the existing inline artifact intake path, so the same upload budgets and artifact persistence rules apply.</div>',
    '          </div>',
    '          <div class="actions">',
    '            <button id="submitButton" class="primary" type="submit">Submit Feedback</button>',
    '            <button id="resetButton" class="secondary" type="reset">Reset</button>',
    '            <span class="helper">The widget returns a report id immediately and the report then moves into triage plus review gating.</span>',
    '          </div>',
    '        </form>',
    '        <div id="status" class="status">Ready to capture project-scoped hosted feedback.</div>',
    '      </article>',
    '      <aside class="panel aside">',
    '        <article class="card">',
    '          <h2>What happens next</h2>',
    '          <p class="helper">1. The report is stored with project scope. 2. Inline artifacts are persisted. 3. Triage and replay jobs enqueue when applicable. 4. Hosted feedback lands in the review queue with issue state <strong>awaiting-review</strong>.</p>',
    '        </article>',
    '        <article class="card">',
    '          <h2>Response Preview</h2>',
    '          <pre id="responsePreview">// Accepted response will appear here</pre>',
    '        </article>',
    '      </aside>',
    '    </section>',
    '  </main>',
    '  <script>',
    `    const projectKey = ${JSON.stringify(project.projectKey)};`,
    '    const submissionPath = `/public/projects/${projectKey}/feedback`;',
    `    const embedded = ${embedded ? 'true' : 'false'};`,
    '    const form = document.getElementById("feedbackForm");',
    '    const statusEl = document.getElementById("status");',
    '    const responsePreviewEl = document.getElementById("responsePreview");',
    '    const submitButton = document.getElementById("submitButton");',
    '    const closeButton = document.getElementById("closeEmbed");',
    '    document.getElementById("projectKeyDisplay").textContent = projectKey;',
    '    document.getElementById("submissionPath").textContent = submissionPath;',
    '    document.getElementById("pageUrl").value = window.location.href;',
    '    function setStatus(message, kind) {',
    '      statusEl.textContent = message;',
    '      statusEl.className = `status${kind ? ` ${kind}` : ""}`;',
    '    }',
    '    function notifyParent(type, detail) {',
    '      if (!embedded || !window.parent || window.parent === window) return;',
    '      window.parent.postMessage({ source: "nexus-hosted-widget", type, detail }, "*");',
    '    }',
    '    async function encodeFile(file) {',
    '      if (!file) return undefined;',
    '      const buffer = await file.arrayBuffer();',
    '      let binary = "";',
    '      const bytes = new Uint8Array(buffer);',
    '      for (let index = 0; index < bytes.length; index += 1) {',
    '        binary += String.fromCharCode(bytes[index]);',
    '      }',
    '      return {',
    '        fileName: file.name,',
    '        mimeType: file.type || "application/octet-stream",',
    '        contentBase64: btoa(binary)',
    '      };',
    '    }',
    '    function splitLabels(value) {',
    '      return value.split(",").map((entry) => entry.trim()).filter(Boolean);',
    '    }',
    '    async function buildArtifacts() {',
    '      const uploads = {',
    '        consoleLogs: await encodeFile(document.getElementById("consoleLogsFile").files[0]),',
    '        har: await encodeFile(document.getElementById("harFile").files[0]),',
    '        localStorage: await encodeFile(document.getElementById("localStorageFile").files[0]),',
    '        sessionStorage: await encodeFile(document.getElementById("sessionStorageFile").files[0]),',
    '        screenRecording: await encodeFile(document.getElementById("screenRecordingFile").files[0])',
    '      };',
    '      const hasUploads = Object.values(uploads).some(Boolean);',
    '      return {',
    '        hasConsoleLogs: Boolean(uploads.consoleLogs),',
    '        hasHar: Boolean(uploads.har),',
    '        hasLocalStorageSnapshot: Boolean(uploads.localStorage),',
    '        hasSessionStorageSnapshot: Boolean(uploads.sessionStorage),',
    '        hasScreenRecording: Boolean(uploads.screenRecording),',
    '        ...(hasUploads ? { uploads } : {})',
    '      };',
    '    }',
    '    form.addEventListener("submit", async (event) => {',
    '      event.preventDefault();',
    '      submitButton.disabled = true;',
    '      setStatus("Submitting feedback...", "");',
    '      try {',
    '        const artifacts = await buildArtifacts();',
    '        const payload = {',
    '          sessionId: `hosted-widget-${crypto.randomUUID()}` ,',
    '          title: document.getElementById("title").value.trim(),',
    '          description: document.getElementById("description").value.trim() || undefined,',
    '          pageUrl: document.getElementById("pageUrl").value.trim(),',
    '          environment: document.getElementById("environment").value,',
    '          severity: document.getElementById("severity").value,',
    '          reporter: {',
    '            id: document.getElementById("reporterId").value.trim() || undefined,',
    '            name: document.getElementById("reporterName").value.trim() || undefined,',
    '            email: document.getElementById("reporterEmail").value.trim() || undefined,',
    '            role: document.getElementById("reporterRole").value',
    '          },',
    '          signals: {',
    '            consoleErrorCount: Number(document.getElementById("consoleErrorCount").value || 0),',
    '            networkErrorCount: Number(document.getElementById("networkErrorCount").value || 0),',
    '            stakeholderCount: Number(document.getElementById("stakeholderCount").value || 1)',
    '          },',
    '          labels: splitLabels(document.getElementById("labels").value),',
    '          notes: document.getElementById("notes").value.trim() || undefined,',
    '          artifacts',
    '        };',
    '        const response = await fetch(submissionPath, {',
    '          method: "POST",',
    '          headers: { "content-type": "application/json" },',
    '          body: JSON.stringify(payload)',
    '        });',
    '        const text = await response.text();',
    '        if (!response.ok) {',
    '          throw new Error(`${response.status} ${text}`);',
    '        }',
    '        responsePreviewEl.textContent = text;',
    '        const parsed = JSON.parse(text);',
    '        setStatus(`Feedback accepted. Report ${parsed.reportId} is queued for triage and review.`, "success");',
    '        notifyParent("submitted", parsed);',
    '        form.reset();',
    '        document.getElementById("pageUrl").value = window.location.href;',
    '      } catch (error) {',
    '        responsePreviewEl.textContent = String(error instanceof Error ? error.message : error);',
    '        setStatus(error instanceof Error ? error.message : "Submission failed.", "error");',
    '        notifyParent("error", { message: error instanceof Error ? error.message : "Submission failed." });',
    '      } finally {',
    '        submitButton.disabled = false;',
    '      }',
    '    });',
    '    if (closeButton) {',
    '      closeButton.addEventListener("click", () => notifyParent("close", { projectKey }));',
    '    }',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}

function buildHostedFeedbackEmbedScript(project: { projectKey: string; name: string }): string {
  const iframePath = `/public/projects/${project.projectKey}/widget?embed=true`;

  return [
    '(function () {',
    '  const script = document.currentScript;',
    `  const projectKey = ${JSON.stringify(project.projectKey)};`,
    `  const projectName = ${JSON.stringify(project.name)};`,
    '  const baseUrl = script ? new URL(script.src, window.location.href).origin : window.location.origin;',
    '  const label = script && script.dataset.label ? script.dataset.label : `Report an issue to ${projectName}`;',
    '  const position = script && script.dataset.position ? script.dataset.position : "bottom-right";',
    '  const inlineTarget = script && script.dataset.inlineTarget ? document.querySelector(script.dataset.inlineTarget) : null;',
    '  const iframeUrl = new URL(baseUrl + ' + JSON.stringify(iframePath) + ');',
    '  iframeUrl.searchParams.set("origin", window.location.origin);',
    '  const style = document.createElement("style");',
    '  style.textContent = [',
    '    ".nexus-widget-launcher{position:fixed;z-index:9998;padding:14px 18px;border:none;border-radius:999px;background:linear-gradient(135deg,#bf5a2a,#8e3c16);color:#fff7ef;font:600 14px/1.1 \"Avenir Next\",\"Segoe UI\",sans-serif;box-shadow:0 18px 45px rgba(19,33,47,0.24);cursor:pointer;}",',
    '    ".nexus-widget-launcher[data-position=bottom-right]{right:20px;bottom:20px;}",',
    '    ".nexus-widget-launcher[data-position=bottom-left]{left:20px;bottom:20px;}",',
    '    ".nexus-widget-backdrop{position:fixed;inset:0;background:rgba(18,26,35,0.48);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:18px;z-index:9999;}",',
    '    ".nexus-widget-backdrop.is-open{display:flex;}",',
    '    ".nexus-widget-frame{width:min(1080px,100%);height:min(92vh,860px);border:none;border-radius:28px;box-shadow:0 30px 90px rgba(18,26,35,0.28);background:#fff;}",',
    '    ".nexus-widget-inline{width:100%;min-height:860px;border:none;border-radius:28px;box-shadow:0 20px 55px rgba(18,26,35,0.18);background:#fff;}"',
    '  ].join("");',
    '  document.head.appendChild(style);',
    '  const frame = document.createElement("iframe");',
    '  frame.src = iframeUrl.toString();',
    '  frame.title = `${projectName} feedback widget`;',
    '  if (inlineTarget) {',
    '    frame.className = "nexus-widget-inline";',
    '    inlineTarget.appendChild(frame);',
    '    return;',
    '  }',
    '  frame.className = "nexus-widget-frame";',
    '  const backdrop = document.createElement("div");',
    '  backdrop.className = "nexus-widget-backdrop";',
    '  backdrop.appendChild(frame);',
    '  backdrop.addEventListener("click", function (event) {',
    '    if (event.target === backdrop) { backdrop.classList.remove("is-open"); }',
    '  });',
    '  const launcher = document.createElement("button");',
    '  launcher.type = "button";',
    '  launcher.className = "nexus-widget-launcher";',
    '  launcher.dataset.position = position;',
    '  launcher.textContent = label;',
    '  launcher.addEventListener("click", function () { backdrop.classList.add("is-open"); });',
    '  window.addEventListener("message", function (event) {',
    '    const data = event.data;',
    '    if (!data || data.source !== "nexus-hosted-widget") return;',
    '    if (data.type === "close" || data.type === "submitted") { backdrop.classList.remove("is-open"); }',
    '  });',
    '  document.body.appendChild(backdrop);',
    '  document.body.appendChild(launcher);',
    '})();'
  ].join('\n');
}

export function registerProjectPublicRoutes(app: FastifyInstance): void {
  app.get('/public/projects/:projectKey/embed.js', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    reply.type('application/javascript; charset=utf-8');
    return buildHostedFeedbackEmbedScript(project);
  });

  app.get('/public/projects/:projectKey/widget', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    const query = widgetQuerySchema.parse(request.query);
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    reply.type('text/html; charset=utf-8');
    return buildHostedFeedbackWidgetPage(project, {
      embedded: query.embed === true
    });
  });

  app.post('/public/projects/:projectKey/feedback', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    const payload = publicFeedbackSchema.parse(request.body);
    const sessionId = payload.sessionId ?? `public-feedback-${randomUUID()}`;
    const uploads = normalizeCapturedUploads(payload.artifacts.uploads);
    validateUploadBudgets(app, [
      { key: 'screenRecording', upload: uploads.screenRecording },
      { key: 'har', upload: uploads.har },
      { key: 'consoleLogs', upload: uploads.consoleLogs },
      { key: 'localStorage', upload: uploads.localStorage },
      { key: 'sessionStorage', upload: uploads.sessionStorage }
    ]);

    const impactScore = computeInitialImpactScore({
      source: 'hosted-feedback',
      severity: payload.severity,
      breadth: payload.signals.stakeholderCount,
      frequency: payload.signals.consoleErrorCount + payload.signals.networkErrorCount
    });

    const payloadForStorage = {
      sessionId,
      title: payload.title,
      description: payload.description ?? null,
      pageUrl: payload.pageUrl,
      environment: payload.environment,
      severity: payload.severity,
      reporter: {
        ...payload.reporter,
        identifier: resolveReporterIdentifier(payload.reporter)
      },
      signals: payload.signals,
      labels: payload.labels ?? [],
      notes: payload.notes ?? null,
      artifacts: {
        ...payload.artifacts,
        ...(Object.keys(summarizeUploads(uploads)).length > 0
          ? { uploads: summarizeUploads(uploads) }
          : {})
      },
      project: {
        id: project.id,
        projectKey: project.projectKey,
        name: project.name
      },
      sourceSurface: 'hosted-widget',
      impactScore
    };

    const ingested = await ingestFeedbackReport(app, {
      projectId: project.id,
      source: 'hosted-feedback',
      externalId: sessionId,
      title: payload.title,
      severity: payload.severity,
      reporterIdentifier: resolveReporterIdentifier(payload.reporter),
      payload: payloadForStorage,
      triagePriority: impactScore
    });

    await persistCapturedArtifacts(app, {
      reportId: ingested.report.id,
      sessionId,
      environment: payload.environment,
      reporterId: resolveReporterIdentifier(payload.reporter),
      uploads,
      artifacts: payload.artifacts
    });

    const replayJobResult = payload.artifacts.hasHar || Boolean(uploads.har)
      ? await app.jobs.enqueue({
        type: 'replay',
        reportId: ingested.report.id,
        source: 'hosted-feedback',
        priority: impactScore,
        payload: {
          artifactType: 'har',
          projectId: project.id
        }
      })
      : null;

    await app.audit.write({
      eventType: 'public_feedback.received',
      actorType: 'user',
      actorId: resolveReporterIdentifier(payload.reporter),
      requestId: request.id,
      payload: {
        reportId: ingested.report.id,
        projectId: project.id,
        projectKey: project.projectKey,
        jobId: ingested.triageJobId,
        ...(replayJobResult ? { replayJobId: replayJobResult.jobId } : {}),
        impactScore,
        environment: payload.environment
      }
    });

    return reply.code(202).send({
      accepted: true,
      reportId: ingested.report.id,
      jobId: ingested.triageJobId,
      ...(replayJobResult ? { replayJobId: replayJobResult.jobId } : {}),
      project: {
        id: project.id,
        projectKey: project.projectKey,
        name: project.name
      },
      impactScore
    });
  });
}