export function buildSupportOpsPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nexus Support Operations</title>
  <style>
    :root { color-scheme: light; --bg-top: #f5f0e6; --bg-bottom: #d6e3df; --ink: #18212b; --muted: rgba(24,33,43,0.7); --panel: rgba(255,255,255,0.88); --panel-strong: rgba(255,255,255,0.95); --line: rgba(24,33,43,0.12); --accent: #0b6557; --accent-soft: rgba(11,101,87,0.12); --warn: #8b6208; --danger: #922f2f; --shadow: 0 24px 64px rgba(24,33,43,0.12); }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; color: var(--ink); background: radial-gradient(circle at top left, #fff8eb 0%, var(--bg-top) 42%, var(--bg-bottom) 100%); }
    main { max-width: 1340px; margin: 0 auto; padding: 36px 18px 64px; }
    h1 { margin: 0; font-size: clamp(2.7rem, 6vw, 4.8rem); line-height: 0.92; max-width: 12ch; }
    p { color: var(--muted); line-height: 1.6; max-width: 78ch; }
    .eyebrow { display: inline-flex; margin-bottom: 14px; padding: 8px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font: 700 0.76rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.08em; }
    .hero { display: grid; gap: 14px; margin-bottom: 28px; }
    .shell { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 18px; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 28px; box-shadow: var(--shadow); overflow: hidden; }
    .controls, .workspace { display: grid; gap: 14px; padding: 18px; }
    label { display: grid; gap: 6px; font-size: 0.92rem; color: var(--muted); }
    input, button, textarea { font: inherit; }
    input, textarea { width: 100%; border: 1px solid var(--line); border-radius: 14px; padding: 11px 12px; background: var(--panel-strong); color: var(--ink); }
    textarea { min-height: 120px; resize: vertical; }
    button { border: none; border-radius: 14px; padding: 12px 14px; cursor: pointer; transition: transform 140ms ease, opacity 140ms ease; }
    button:hover { transform: translateY(-1px); }
    button.primary { background: var(--accent); color: #fffaf4; }
    button.secondary { background: rgba(255,255,255,0.9); border: 1px solid var(--line); color: var(--ink); }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .card { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,0.78); }
    .card strong { display: block; font-size: 1.6rem; line-height: 1; margin-top: 8px; }
    .section { border: 1px solid var(--line); border-radius: 22px; background: rgba(255,255,255,0.6); padding: 16px; display: grid; gap: 12px; }
    .section-title { margin: 0; font: 700 0.86rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    .helper { color: var(--muted); font-size: 0.9rem; }
    .status { padding: 12px 14px; border-top: 1px solid var(--line); min-height: 48px; color: var(--muted); background: rgba(24,33,43,0.03); }
    .pill-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { display: inline-flex; padding: 7px 10px; border-radius: 999px; background: rgba(11,101,87,0.1); color: var(--accent); font: 600 0.8rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .checklist-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .check-card { border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(255,255,255,0.78); }
    .check-card strong { display: block; font-size: 0.94rem; }
    .check-card span { display: block; margin-top: 6px; color: var(--muted); font-size: 0.84rem; }
    .check-pass strong { color: var(--accent); }
    .check-fail strong { color: var(--danger); }
    .warn { color: var(--warn); }
    .danger { color: var(--danger); }
    .link-list { display: grid; gap: 8px; }
    .link-list a { color: var(--accent); text-decoration: none; word-break: break-all; }
    .activity-list { display: grid; gap: 10px; }
    .activity-item { border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(255,255,255,0.78); }
    .button-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .guardrail-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .guardrail-card { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,0.78); }
    .guardrail-card strong { display: block; font-size: 0.95rem; }
    .guardrail-card span { display: block; margin-top: 8px; color: var(--muted); font-size: 0.84rem; line-height: 1.45; }
    .guardrail-pass { border-color: rgba(11,101,87,0.28); background: rgba(11,101,87,0.08); }
    .guardrail-pass strong { color: var(--accent); }
    .guardrail-fail { border-color: rgba(139,98,8,0.26); background: rgba(139,98,8,0.09); }
    .guardrail-fail strong { color: var(--warn); }
    .guardrail-neutral { border-color: var(--line); }
    pre { margin: 0; padding: 14px; border-radius: 18px; background: #201d1f; color: #f7efe3; overflow: auto; font: 0.82rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    @media (max-width: 1120px) { .shell, .summary-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow">Operate • Promote</span>
      <h1>Operate live customer support and confirm the project is ready for promotion.</h1>
      <p>This page covers the back half of the five-step story: operate the live project by checking readiness, links, grants, and recent hosted feedback, then confirm the team can safely promote customer-facing access without losing control of the queue.</p>
    </section>
    <section class="shell">
      <aside class="panel">
        <div class="controls">
          <label>Base URL<input id="baseUrl" value="" placeholder="http://127.0.0.1:4000" /></label>
          <label>Bearer Token<input id="token" value="" placeholder="nexus-local-dev-token" /></label>
          <label>Project Key<input id="projectKey" value="" placeholder="checkout-prod" /></label>
          <label>Project Id<input id="projectId" value="" placeholder="project UUID optional" /></label>
          <div class="row">
            <label style="flex:1 1 220px;">Customer Email<input id="customerPortalEmail" value="" placeholder="customer@example.com" /></label>
            <label style="flex:1 1 220px;">Customer Name<input id="customerPortalName" value="" placeholder="Checkout Team" /></label>
          </div>
          <div class="row">
            <label style="flex:1 1 140px;">Grant TTL Days<input id="customerPortalTtlDays" value="30" placeholder="30" /></label>
            <label style="flex:1 1 220px;">Portal Grant Id<input id="customerPortalGrantId" value="" placeholder="customer portal grant UUID" /></label>
          </div>
          <label>Customer Portal Notes<textarea id="customerPortalNotes" placeholder="Why this durable customer portal access is being created, reused, or revoked."></textarea></label>
          <div class="row">
            <button id="lookupProject" class="secondary">Lookup Project</button>
            <button id="loadSupport" class="primary">Load Support Snapshot</button>
          </div>
          <div class="row">
            <button id="loadCustomerPortalGrants" class="secondary">Load Portal Grants</button>
            <button id="createCustomerPortalGrant" class="primary">Create Portal Grant</button>
            <button id="revokeCustomerPortalGrant" class="secondary">Revoke Portal Grant</button>
          </div>
          <div class="row">
            <button id="openReviewQueue" class="secondary">Open Review Queue Link</button>
            <button id="openOnboarding" class="secondary">Open Onboarding Link</button>
          </div>
          <div id="status" class="status">Waiting for project lookup.</div>
        </div>
      </aside>
      <section class="panel workspace">
        <div class="summary-grid">
          <article class="card"><span class="helper">Promote Readiness</span><strong id="readinessValue">unknown</strong><span id="readinessNote" class="helper">Load a project support snapshot.</span></article>
          <article class="card"><span class="helper">Connect State</span><strong id="repositoryCount">0</strong><span class="helper">Active repository connections in scope.</span></article>
          <article class="card"><span class="helper">Operate Queue</span><strong id="pendingReviewCount">0</strong><span class="helper">Hosted feedback items still awaiting review.</span></article>
          <article class="card"><span class="helper">Promote Context</span><strong id="recentFeedbackCount">0</strong><span class="helper">Latest hosted feedback items visible from support.</span></article>
        </div>
        <section class="section">
          <h2 class="section-title">Readiness And Promotion Guardrails</h2>
          <div class="guardrail-grid">
            <article id="guardrailBoundary" class="guardrail-card guardrail-neutral"><strong>Project boundary unresolved</strong><span>Load a support snapshot to confirm live repository scope.</span></article>
            <article id="guardrailReadiness" class="guardrail-card guardrail-neutral"><strong>Readiness state unknown</strong><span>Support checks have not been loaded yet.</span></article>
            <article id="guardrailReviewGate" class="guardrail-card guardrail-neutral"><strong>Review gate unknown</strong><span>Pending review work has not been evaluated yet.</span></article>
            <article id="guardrailPromotionScope" class="guardrail-card guardrail-neutral"><strong>Customer access scope unknown</strong><span>Confirm durable access is either absent or explicitly scoped before promotion.</span></article>
          </div>
        </section>
        <section class="section">
          <h2 class="section-title">Operate Checklist</h2>
          <div id="checklist" class="checklist-grid"></div>
          <div id="issues" class="helper">No support checks loaded yet.</div>
        </section>
        <section class="section">
          <h2 class="section-title">Promote Customer Access</h2>
          <div id="customerPortalGrantSummary" class="helper">No customer portal grant action run yet.</div>
          <div id="customerPortalGrantList" class="button-list"></div>
          <pre id="customerPortalGrantResult">// customer portal grant responses appear here</pre>
        </section>
        <section class="section">
          <h2 class="section-title">Operate Links</h2>
          <div id="links" class="link-list"></div>
        </section>
        <section class="section">
          <h2 class="section-title">Recent Hosted Feedback</h2>
          <div id="recentFeedback" class="activity-list"><div class="helper">No hosted feedback loaded yet.</div></div>
        </section>
        <section class="section">
          <h2 class="section-title">Support Snapshot JSON</h2>
          <pre id="result">// support snapshot appears here</pre>
        </section>
      </section>
    </section>
  </main>
  <script>
    const storageKey = 'nexus-support-ops';
    const els = {
      baseUrl: document.getElementById('baseUrl'),
      token: document.getElementById('token'),
      projectKey: document.getElementById('projectKey'),
      projectId: document.getElementById('projectId'),
      customerPortalEmail: document.getElementById('customerPortalEmail'),
      customerPortalName: document.getElementById('customerPortalName'),
      customerPortalTtlDays: document.getElementById('customerPortalTtlDays'),
      customerPortalGrantId: document.getElementById('customerPortalGrantId'),
      customerPortalNotes: document.getElementById('customerPortalNotes'),
      lookupProject: document.getElementById('lookupProject'),
      loadSupport: document.getElementById('loadSupport'),
      loadCustomerPortalGrants: document.getElementById('loadCustomerPortalGrants'),
      createCustomerPortalGrant: document.getElementById('createCustomerPortalGrant'),
      revokeCustomerPortalGrant: document.getElementById('revokeCustomerPortalGrant'),
      openReviewQueue: document.getElementById('openReviewQueue'),
      openOnboarding: document.getElementById('openOnboarding'),
      status: document.getElementById('status'),
      readinessValue: document.getElementById('readinessValue'),
      readinessNote: document.getElementById('readinessNote'),
      repositoryCount: document.getElementById('repositoryCount'),
      pendingReviewCount: document.getElementById('pendingReviewCount'),
      recentFeedbackCount: document.getElementById('recentFeedbackCount'),
      checklist: document.getElementById('checklist'),
      issues: document.getElementById('issues'),
      customerPortalGrantSummary: document.getElementById('customerPortalGrantSummary'),
      customerPortalGrantList: document.getElementById('customerPortalGrantList'),
      customerPortalGrantResult: document.getElementById('customerPortalGrantResult'),
      links: document.getElementById('links'),
      recentFeedback: document.getElementById('recentFeedback'),
      result: document.getElementById('result'),
      guardrailBoundary: document.getElementById('guardrailBoundary'),
      guardrailReadiness: document.getElementById('guardrailReadiness'),
      guardrailReviewGate: document.getElementById('guardrailReviewGate'),
      guardrailPromotionScope: document.getElementById('guardrailPromotionScope')
      guardrailBoundary: document.getElementById('guardrailBoundary'),
      guardrailReadiness: document.getElementById('guardrailReadiness'),
      guardrailReviewGate: document.getElementById('guardrailReviewGate'),
    function renderGuardrailCard(target, tone, title, detail) {
      target.className = 'guardrail-card guardrail-' + tone;
      target.innerHTML = '<strong>' + title + '</strong><span>' + detail + '</span>';
    }
      guardrailPromotionScope: document.getElementById('guardrailPromotionScope')
    };
    let lastSupport = null;
    function setStatus(message) { els.status.textContent = message; }
    function renderGuardrailCard(target, tone, title, detail) {
      target.className = 'guardrail-card guardrail-' + tone;
      target.innerHTML = '<strong>' + title + '</strong><span>' + detail + '</span>';
    }
    function authHeaders() {
      const token = els.token.value.trim();
      return token ? { Authorization: 'Bearer ' + token } : {};
    }
    function saveState() {
      localStorage.setItem(storageKey, JSON.stringify({
        baseUrl: els.baseUrl.value.trim(),
        token: els.token.value.trim(),
        projectKey: els.projectKey.value.trim(),
        projectId: els.projectId.value.trim(),
        customerPortalEmail: els.customerPortalEmail.value.trim(),
        customerPortalName: els.customerPortalName.value.trim(),
        customerPortalTtlDays: els.customerPortalTtlDays.value.trim(),
        customerPortalGrantId: els.customerPortalGrantId.value.trim(),
        customerPortalNotes: els.customerPortalNotes.value
      }));
    }
    function readState() {
      try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
    }
    async function request(path, init) {
      const response = await fetch((els.baseUrl.value.trim() || window.location.origin) + path, init);
      const text = await response.text();
      if (!response.ok) {
        throw new Error((init && init.method ? init.method : 'GET') + ' ' + path + ' failed: ' + response.status + ' ' + text);
      }
      return JSON.parse(text);
    }
    function parseCustomerPortalTtlDays() {
      const raw = els.customerPortalTtlDays.value.trim();
      if (!raw) {
        return undefined;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
        throw new Error('Grant TTL Days must be a number between 1 and 365.');
      }
      return Math.round(parsed);
    }
    function renderLink(name, href) {
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      anchor.textContent = name + ': ' + href;
      els.links.appendChild(anchor);
    }
    function selectCustomerPortalGrant(grant) {
      els.customerPortalGrantId.value = grant.id || '';
      els.customerPortalEmail.value = grant.customerEmail || '';
      els.customerPortalName.value = grant.customerName || '';
      els.customerPortalGrantSummary.textContent = 'Loaded durable portal grant for ' + (grant.customerEmail || 'unknown customer') + '.';
    }
    function renderCustomerPortalGrants(result) {
      const grants = Array.isArray(result && result.grants) ? result.grants : Array.isArray(result) ? result : [];
      els.customerPortalGrantList.innerHTML = '';
      els.customerPortalGrantResult.textContent = JSON.stringify(result, null, 2);
      grants.forEach(function (grant) {
        const button = document.createElement('button');
        button.className = 'secondary';
        button.textContent = (grant.customerEmail || 'unknown') + ' [' + (grant.status || 'unknown') + ']';
        button.addEventListener('click', function () { selectCustomerPortalGrant(grant); });
        els.customerPortalGrantList.appendChild(button);
      });
      if (!grants.length) {
        els.customerPortalGrantSummary.textContent = 'No durable customer portal grants exist for this project yet.';
      } else {
        const activeCount = grants.filter(function (grant) { return grant && grant.status === 'active'; }).length;
        els.customerPortalGrantSummary.textContent = 'Loaded ' + grants.length + ' grant(s). Active ' + activeCount + '.';
      }
    }
    function renderSupportSnapshot(result) {
      lastSupport = result;
      const support = result.support || {};
      const issues = Array.isArray(support.issues) ? support.issues : [];
      const checklist = support.checklist || {};
      const recentHostedFeedback = Array.isArray(support.recentHostedFeedback) ? support.recentHostedFeedback : [];
      const repositoryCount = Array.isArray(result.repositories && result.repositories.available) ? result.repositories.available.length : 0;
      const pendingReviewCount = result.reports && typeof result.reports.pendingReviewCount === 'number' ? result.reports.pendingReviewCount : 0;
      const grantCount = result.customerPortal && typeof result.customerPortal.activeGrantCount === 'number'
        ? result.customerPortal.activeGrantCount
        : Array.isArray(result.customerPortal && result.customerPortal.grants)
          ? result.customerPortal.grants.filter(function (grant) { return grant && grant.status === 'active'; }).length
          : 0;
      els.result.textContent = JSON.stringify(result, null, 2);
      els.readinessValue.textContent = support.readiness || 'unknown';
      els.readinessNote.textContent = issues.length ? issues.join(' ') : 'Support checks look good for this project.';
      els.repositoryCount.textContent = String(repositoryCount);
      els.pendingReviewCount.textContent = String(pendingReviewCount);
      els.recentFeedbackCount.textContent = String(recentHostedFeedback.length);
      els.checklist.innerHTML = '';
      els.links.innerHTML = '';
      els.recentFeedback.innerHTML = '';
      Object.entries(checklist).forEach(function (entry) {
        const card = document.createElement('div');
        const passed = entry[1] === true;
        const label = document.createElement('strong');
        const detail = document.createElement('span');
        card.className = 'check-card ' + (passed ? 'check-pass' : 'check-fail');
        label.textContent = entry[0];
        detail.textContent = passed ? 'ready' : 'missing';
        card.appendChild(label);
        card.appendChild(detail);
        els.checklist.appendChild(card);
      });
      els.issues.className = 'helper' + (issues.length ? ' warn' : '');
      els.issues.textContent = issues.length ? issues.join(' ') : 'No open support blockers.';
      renderGuardrailCard(els.guardrailBoundary, repositoryCount > 0 ? 'pass' : 'fail', repositoryCount > 0 ? 'Project boundary is visible' : 'Project boundary is still unresolved', repositoryCount > 0 ? 'Repository scope is loaded for this project, so promotion targets are visible.' : 'Load a project with active repository connections before extending rollout or access.');
      renderGuardrailCard(els.guardrailReadiness, support.readiness === 'ready' ? 'pass' : 'fail', support.readiness === 'ready' ? 'Readiness is green' : 'Readiness is not green', support.readiness === 'ready' ? 'Support checks show the live project is ready for customer-facing use.' : 'Do not expand promotion or durable access while support readiness is blocked or unknown.');
      renderGuardrailCard(els.guardrailReviewGate, pendingReviewCount === 0 ? 'pass' : 'fail', pendingReviewCount === 0 ? 'Review gate is clear' : 'Review gate still has pending work', pendingReviewCount === 0 ? 'No hosted-feedback backlog is waiting on operator review.' : String(pendingReviewCount) + ' hosted-feedback item(s) still need queue review before promotion should move forward.');
      renderGuardrailCard(els.guardrailPromotionScope, support.readiness === 'ready' && pendingReviewCount === 0 ? (grantCount > 0 ? 'pass' : 'neutral') : 'fail', grantCount > 0 ? 'Customer access is explicitly scoped' : 'No durable customer access is live', grantCount > 0 ? 'Durable visibility is currently constrained to ' + grantCount + ' active customer portal grant(s).' : support.readiness === 'ready' && pendingReviewCount === 0 ? 'No durable customer portal grant is live yet, which is safe while rollout stays narrow.' : 'Hold customer access changes until readiness is green and the review gate is clear.');
      const publicUrls = support.publicUrls || {};
      if (publicUrls.widgetBaseUrl) {
        renderLink('Widget Base URL', publicUrls.widgetBaseUrl);
      }
      if (publicUrls.embedScriptBaseUrl) {
        renderLink('Embed Script URL', publicUrls.embedScriptBaseUrl);
      }
      if (publicUrls.feedbackUrl) {
        renderLink('Feedback Route', publicUrls.feedbackUrl);
      }
      if (publicUrls.customerPortalBaseUrl) {
        renderLink('Customer Portal Base URL', publicUrls.customerPortalBaseUrl);
      }
      if (support.reviewQueueUrl) {
        renderLink('Review Queue', support.reviewQueueUrl);
      }
      if (support.onboardingUrl) {
        renderLink('Onboarding Console', support.onboardingUrl);
      }
      if (support.supportOpsUrl) {
        renderLink('Support Ops', support.supportOpsUrl);
      }
      if (!recentHostedFeedback.length) {
        const empty = document.createElement('div');
        empty.className = 'helper';
        empty.textContent = 'No recent hosted feedback for this project yet.';
        els.recentFeedback.appendChild(empty);
      }
      recentHostedFeedback.forEach(function (item) {
        const card = document.createElement('div');
        card.className = 'activity-item';
        const title = document.createElement('strong');
        title.textContent = (item.title || item.id) + ' [' + (item.status || 'unknown') + ']';
        const meta = document.createElement('div');
        meta.className = 'helper';
        meta.textContent = 'Severity ' + (item.severity || 'unknown') + '. Review ' + (item.reviewStatus || 'pending') + '. Created ' + (item.createdAt || 'unknown') + '.';
        card.appendChild(title);
        card.appendChild(meta);
        els.recentFeedback.appendChild(card);
      });
      if (result.customerPortal) {
        renderCustomerPortalGrants({ project: result.project, grants: result.customerPortal.grants || [] });
      }
    }
    async function lookupProject() {
      saveState();
      const projectKey = els.projectKey.value.trim();
      if (!projectKey) {
        setStatus('Project Key is required.');
        return;
      }
      setStatus('Looking up project ' + projectKey + '...');
      try {
        const result = await request('/internal/projects/key/' + encodeURIComponent(projectKey), { headers: authHeaders() });
        if (result.project && result.project.id) {
          els.projectId.value = result.project.id;
          els.projectKey.value = result.project.projectKey;
        }
        setStatus('Project lookup loaded for ' + projectKey + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to look up project.');
      }
    }
    async function loadSupport() {
      saveState();
      let projectId = els.projectId.value.trim();
      const projectKey = els.projectKey.value.trim();
      if (!projectId && projectKey) {
        await lookupProject();
        projectId = els.projectId.value.trim();
      }
      if (!projectId) {
        setStatus('Project Id or Project Key is required.');
        return;
      }
      setStatus('Loading support snapshot for ' + projectId + '...');
      try {
        const result = await request('/internal/projects/' + projectId + '/operations', { headers: authHeaders() });
        renderSupportSnapshot(result);
        setStatus('Support snapshot loaded for ' + projectId + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to load support snapshot.');
      }
    }
    async function loadCustomerPortalGrants() {
      saveState();
      let projectId = els.projectId.value.trim();
      const projectKey = els.projectKey.value.trim();
      if (!projectId && projectKey) {
        await lookupProject();
        projectId = els.projectId.value.trim();
      }
      if (!projectId) {
        setStatus('Project Id or Project Key is required to load customer portal grants.');
        return;
      }
      setStatus('Loading customer portal grants for ' + projectId + '...');
      try {
        const result = await request('/internal/projects/' + projectId + '/customer-portal-grants', { headers: authHeaders() });
        renderCustomerPortalGrants(result);
        setStatus('Customer portal grants loaded for ' + projectId + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to load customer portal grants.');
      }
    }
    async function createCustomerPortalGrant() {
      saveState();
      let projectId = els.projectId.value.trim();
      const projectKey = els.projectKey.value.trim();
      const customerEmail = els.customerPortalEmail.value.trim();
      if (!projectId && projectKey) {
        await lookupProject();
        projectId = els.projectId.value.trim();
      }
      if (!projectId || !customerEmail) {
        setStatus('Project Id or Project Key plus Customer Email are required to create a customer portal grant.');
        return;
      }
      setStatus('Creating customer portal grant for ' + customerEmail + '...');
      try {
        const result = await request('/internal/projects/' + projectId + '/customer-portal-grants', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            customerEmail: customerEmail,
            customerName: els.customerPortalName.value.trim() || undefined,
            ttlDays: parseCustomerPortalTtlDays(),
            notes: els.customerPortalNotes.value.trim() || undefined
          })
        });
        els.customerPortalGrantResult.textContent = JSON.stringify(result, null, 2);
        if (result && result.grant) {
          selectCustomerPortalGrant(result.grant);
        }
        await loadSupport();
        await loadCustomerPortalGrants();
        setStatus('Customer portal grant created for ' + customerEmail + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to create customer portal grant.');
      }
    }
    async function revokeCustomerPortalGrant() {
      saveState();
      let projectId = els.projectId.value.trim();
      const projectKey = els.projectKey.value.trim();
      const grantId = els.customerPortalGrantId.value.trim();
      if (!projectId && projectKey) {
        await lookupProject();
        projectId = els.projectId.value.trim();
      }
      if (!projectId || !grantId) {
        setStatus('Project Id or Project Key plus Portal Grant Id are required to revoke a customer portal grant.');
        return;
      }
      setStatus('Revoking customer portal grant ' + grantId + '...');
      try {
        const result = await request('/internal/projects/' + projectId + '/customer-portal-grants/' + encodeURIComponent(grantId) + '/revoke', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            notes: els.customerPortalNotes.value.trim() || undefined
          })
        });
        els.customerPortalGrantResult.textContent = JSON.stringify(result, null, 2);
        if (result && result.grant) {
          selectCustomerPortalGrant(result.grant);
        }
        await loadSupport();
        await loadCustomerPortalGrants();
        setStatus('Customer portal grant ' + grantId + ' revoked.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to revoke customer portal grant.');
      }
    }
    function openLink(kind) {
      const support = lastSupport && lastSupport.support ? lastSupport.support : null;
      const url = kind === 'review'
        ? support && support.reviewQueueUrl
        : support && support.onboardingUrl;
      if (!url) {
        setStatus('Load a support snapshot before opening support links.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    const saved = readState();
    const params = new URLSearchParams(window.location.search);
    els.baseUrl.value = saved.baseUrl || window.location.origin;
    els.token.value = saved.token || '';
    els.projectKey.value = params.get('projectKey') || saved.projectKey || '';
    els.projectId.value = params.get('projectId') || saved.projectId || '';
    els.customerPortalEmail.value = saved.customerPortalEmail || '';
    els.customerPortalName.value = saved.customerPortalName || '';
    els.customerPortalTtlDays.value = saved.customerPortalTtlDays || '30';
    els.customerPortalGrantId.value = saved.customerPortalGrantId || '';
    els.customerPortalNotes.value = saved.customerPortalNotes || '';
    els.lookupProject.addEventListener('click', lookupProject);
    els.loadSupport.addEventListener('click', loadSupport);
    els.loadCustomerPortalGrants.addEventListener('click', loadCustomerPortalGrants);
    els.createCustomerPortalGrant.addEventListener('click', createCustomerPortalGrant);
    els.revokeCustomerPortalGrant.addEventListener('click', revokeCustomerPortalGrant);
    els.openReviewQueue.addEventListener('click', function () { openLink('review'); });
    els.openOnboarding.addEventListener('click', function () { openLink('onboarding'); });
    if (els.projectId.value || els.projectKey.value) {
      loadSupport().catch(function () { return undefined; });
    }
  </script>
</body>
</html>`;
}
