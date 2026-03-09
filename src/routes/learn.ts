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

function buildOnboardingConsolePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nexus Onboarding Console</title>
  <style>
    :root { color-scheme: light; --bg-top: #f6efe1; --bg-bottom: #d7e3de; --ink: #16212c; --muted: rgba(22,33,44,0.7); --panel: rgba(255,255,255,0.88); --panel-strong: rgba(255,255,255,0.95); --line: rgba(22,33,44,0.12); --accent: #0d695b; --accent-soft: rgba(13,105,91,0.12); --warning: #8b6208; --shadow: 0 24px 64px rgba(22,33,44,0.12); }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; color: var(--ink); background: radial-gradient(circle at top left, #fff8ec 0%, var(--bg-top) 40%, var(--bg-bottom) 100%); }
    main { max-width: 1380px; margin: 0 auto; padding: 36px 18px 64px; }
    h1 { margin: 0; font-size: clamp(2.8rem, 6vw, 5rem); line-height: 0.93; max-width: 11ch; }
    p { color: var(--muted); line-height: 1.6; max-width: 78ch; }
    .eyebrow { display: inline-flex; margin-bottom: 14px; padding: 8px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font: 700 0.76rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.08em; }
    .hero { display: grid; gap: 14px; margin-bottom: 28px; }
    .shell { display: grid; grid-template-columns: 430px minmax(0, 1fr); gap: 18px; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 28px; box-shadow: var(--shadow); overflow: hidden; }
    .controls { display: grid; gap: 12px; padding: 18px; }
    .workspace { display: grid; gap: 16px; padding: 18px; min-height: 760px; }
    .split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    label { display: grid; gap: 6px; font-size: 0.92rem; color: var(--muted); }
    input, select, textarea, button { font: inherit; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 14px; padding: 11px 12px; background: var(--panel-strong); color: var(--ink); }
    textarea { min-height: 96px; resize: vertical; }
    button { border: none; border-radius: 14px; padding: 12px 14px; cursor: pointer; transition: transform 140ms ease, opacity 140ms ease; }
    button:hover { transform: translateY(-1px); }
    button.primary { background: var(--accent); color: #fffaf4; }
    button.secondary { background: rgba(255,255,255,0.9); border: 1px solid var(--line); color: var(--ink); }
    button.mini { padding: 8px 10px; border-radius: 10px; font-size: 0.84rem; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    .section { border: 1px solid var(--line); border-radius: 22px; background: rgba(255,255,255,0.6); padding: 16px; display: grid; gap: 12px; }
    .section-title { margin: 0; font: 700 0.86rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    .helper { color: var(--muted); font-size: 0.9rem; }
    .status { padding: 12px 14px; border-top: 1px solid var(--line); min-height: 48px; color: var(--muted); background: rgba(22,33,44,0.03); }
    .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .card { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,0.78); }
    .card strong { display: block; font-size: 1.6rem; line-height: 1; margin-top: 8px; }
    .card .warning { display: block; margin-top: 8px; }
    pre { margin: 0; padding: 14px; border-radius: 18px; background: #201d1f; color: #f7efe3; overflow: auto; font: 0.82rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .result { display: grid; gap: 14px; }
    .pill-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill { display: inline-flex; padding: 7px 10px; border-radius: 999px; background: rgba(13,105,91,0.1); color: var(--accent); font: 600 0.8rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .warning { color: var(--warning); }
    a.inline-link { color: var(--accent); text-decoration: none; }
    .button-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .button-list button { text-align: left; }
    @media (max-width: 1120px) { .shell, .split, .summary-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow">Operator Onboarding Console</span>
      <h1>Support onboarding, repo scope, and customer handoff from one surface.</h1>
      <p>This console now covers project-key lookup, repo-connection create and update flows, GitHub App install and transfer work, service identity lifecycle, and a support snapshot showing whether the project is actually ready to receive customer feedback.</p>
    </section>
    <section class="shell">
      <aside class="panel">
        <div class="controls">
          <label>Base URL<input id="baseUrl" value="" placeholder="http://127.0.0.1:4000" /></label>
          <label>Bearer Token<input id="token" value="" placeholder="nexus-local-dev-token" /></label>
          <div class="split">
            <label>Workspace Id<input id="workspaceId" value="" placeholder="workspace UUID" /></label>
            <label>Project Id<input id="projectId" value="" placeholder="project UUID" /></label>
          </div>
          <label>Project Key<input id="projectKey" value="" placeholder="checkout-prod" /></label>
          <label>Repository<input id="repository" value="" placeholder="owner/repo" /></label>
          <div class="split">
            <label>Installation Id<input id="installationId" value="" placeholder="114991268" /></label>
            <label>Installation Record Id<input id="githubInstallationRecordId" value="" placeholder="github_installations UUID" /></label>
          </div>
          <div class="split">
            <label>Repo Connection Id<input id="repoConnectionId" value="" placeholder="repo_connections UUID" /></label>
            <label>Repo Status<select id="repoConnectionStatus"><option value="">leave unchanged</option><option value="active">active</option><option value="inactive">inactive</option></select></label>
          </div>
          <div class="split">
            <label>Default Behavior<select id="repoConnectionDefault"><option value="auto">leave unchanged</option><option value="true">set default</option><option value="false">clear default</option></select></label>
            <label>Widget Mode<select id="mode"><option value="embed">embed</option><option value="widget">widget</option></select></label>
          </div>
          <label>Repo Connection Config (JSON)<textarea id="repoConnectionConfig" placeholder='{"supportOwner":"ops"}'></textarea></label>
          <div class="split">
            <label>Widget Origin<input id="origin" value="" placeholder="https://customer.example" /></label>
            <label>Service Identity Id<input id="serviceIdentityId" value="" placeholder="service-operator" /></label>
          </div>
          <label>Service Identity Scopes<input id="serviceIdentityScopes" value="internal:read" placeholder="internal:read, github:draft" /></label>
          <label>Workspace Triage Policy (JSON)<textarea id="triagePolicyJson" placeholder='{"ownershipRules":[{"id":"00000000-0000-0000-0000-000000000000","field":"page-host","operator":"equals","value":"checkout.example.com","owner":"checkout-team","scoreBoost":1.4}],"priorityRules":[{"id":"00000000-0000-0000-0000-000000000001","field":"severity","operator":"equals","value":"critical","scoreDelta":15}]}'></textarea></label>
          <div class="row">
            <button id="lookupProject" class="secondary">Lookup Project</button>
            <button id="loadContext" class="secondary">Load Context</button>
            <button id="loadOperations" class="secondary">Load Support Snapshot</button>
          </div>
          <div class="row">
            <button id="loadTriagePolicy" class="secondary">Load Triage Policy</button>
            <button id="saveTriagePolicy" class="primary">Save Triage Policy</button>
            <button id="deleteTriagePolicy" class="secondary">Delete Triage Policy</button>
          </div>
          <div class="row">
            <button id="createRepoConnection" class="primary">Create Repo Connection</button>
            <button id="updateRepoConnection" class="secondary">Update Repo Connection</button>
          </div>
          <div class="row">
            <button id="createInstallLink" class="primary">Create Install Link</button>
            <button id="lookupInstall" class="secondary">Lookup Install</button>
            <button id="reconcileInstall" class="primary">Reconcile Install</button>
          </div>
          <div class="row">
            <button id="transferInstall" class="primary">Transfer Install</button>
            <button id="mintWidget" class="secondary">Mint Widget Session</button>
          </div>
          <div class="row">
            <button id="listServiceIdentities" class="secondary">List Service Identities</button>
            <button id="createServiceIdentity" class="primary">Create Identity</button>
          </div>
          <div class="row">
            <button id="rotateServiceIdentity" class="secondary">Rotate Identity</button>
            <button id="revokeServiceIdentity" class="secondary">Revoke Identity</button>
          </div>
        </div>
        <div id="status" class="status">Waiting for operator input.</div>
      </aside>
      <section class="panel workspace">
        <div class="summary-grid">
          <article class="card"><span class="helper">Installations</span><strong id="installationCount">0</strong><span class="helper">GitHub App installs mapped to this workspace.</span></article>
          <article class="card"><span class="helper">Projects</span><strong id="projectCount">0</strong><span class="helper">Projects currently loaded for the workspace.</span></article>
          <article class="card"><span class="helper">Repo Links</span><strong id="connectionCount">0</strong><span class="helper">Repo connections loaded for the selected project.</span></article>
          <article class="card"><span class="helper">Readiness</span><strong id="readinessValue">unknown</strong><span id="readinessNote" class="helper">Load a support snapshot to score project readiness.</span></article>
        </div>
        <div class="section">
          <h2 class="section-title">Current Bindings</h2>
          <div id="bindings" class="pill-list"></div>
          <div id="bindingNotes" class="helper">Load a workspace and project to inspect their current install and repository bindings.</div>
        </div>
        <div class="section">
          <h2 class="section-title">Repo Connections</h2>
          <div id="repoConnectionList" class="button-list"></div>
          <div id="repoConnectionSummary" class="helper">Select a repo connection to preload the editor, or create one from the controls panel.</div>
          <pre id="repoConnectionResult">// repo-connection responses appear here</pre>
        </div>
        <div class="result">
          <section class="section">
            <h2 class="section-title">Customer Support Snapshot</h2>
            <div id="supportSummary" class="helper">No support snapshot loaded yet.</div>
            <pre id="supportResult">// support readiness appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Project Operations</h2>
            <div id="operationsSummary" class="helper">No project operations loaded yet.</div>
            <pre id="operationsResult">// project operations summary appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Workspace Triage Policy</h2>
            <div id="triagePolicySummary" class="helper">No triage policy loaded yet.</div>
            <pre id="triagePolicyResult">// workspace triage policy appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Service Identities</h2>
            <div id="serviceIdentitySummary" class="helper">No service identity action run yet.</div>
            <pre id="serviceIdentityResult">// service identity responses appear here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Install Link</h2>
            <div id="installLinkSummary" class="helper">No install link generated yet.</div>
            <pre id="installLinkResult">// install-link response appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Installation Lookup</h2>
            <div id="lookupSummary" class="helper">No installation lookup run yet.</div>
            <pre id="lookupResult">// installation lookup appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Reconciliation</h2>
            <div id="reconcileSummary" class="helper">No manual reconciliation run yet.</div>
            <pre id="reconcileResult">// reconcile response appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Transfer</h2>
            <div id="transferSummary" class="helper">No installation transfer run yet.</div>
            <pre id="transferResult">// transfer response appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Widget Handoff</h2>
            <div id="widgetSummary" class="helper">No widget session minted yet.</div>
            <pre id="widgetResult">// widget-session response appears here</pre>
          </section>
        </div>
      </section>
    </section>
  </main>
  <script>
    const storageKey = 'nexus-onboarding-console';
    const contextState = { projects: [], installations: [], repoConnections: [] };
    const els = {
      baseUrl: document.getElementById('baseUrl'),
      token: document.getElementById('token'),
      workspaceId: document.getElementById('workspaceId'),
      projectId: document.getElementById('projectId'),
      projectKey: document.getElementById('projectKey'),
      repository: document.getElementById('repository'),
      installationId: document.getElementById('installationId'),
      githubInstallationRecordId: document.getElementById('githubInstallationRecordId'),
      repoConnectionId: document.getElementById('repoConnectionId'),
      repoConnectionStatus: document.getElementById('repoConnectionStatus'),
      repoConnectionDefault: document.getElementById('repoConnectionDefault'),
      repoConnectionConfig: document.getElementById('repoConnectionConfig'),
      origin: document.getElementById('origin'),
      mode: document.getElementById('mode'),
      triagePolicyJson: document.getElementById('triagePolicyJson'),
      serviceIdentityId: document.getElementById('serviceIdentityId'),
      serviceIdentityScopes: document.getElementById('serviceIdentityScopes'),
      lookupProject: document.getElementById('lookupProject'),
      loadContext: document.getElementById('loadContext'),
      loadOperations: document.getElementById('loadOperations'),
      loadTriagePolicy: document.getElementById('loadTriagePolicy'),
      saveTriagePolicy: document.getElementById('saveTriagePolicy'),
      deleteTriagePolicy: document.getElementById('deleteTriagePolicy'),
      createRepoConnection: document.getElementById('createRepoConnection'),
      updateRepoConnection: document.getElementById('updateRepoConnection'),
      createInstallLink: document.getElementById('createInstallLink'),
      lookupInstall: document.getElementById('lookupInstall'),
      reconcileInstall: document.getElementById('reconcileInstall'),
      transferInstall: document.getElementById('transferInstall'),
      mintWidget: document.getElementById('mintWidget'),
      listServiceIdentities: document.getElementById('listServiceIdentities'),
      createServiceIdentity: document.getElementById('createServiceIdentity'),
      rotateServiceIdentity: document.getElementById('rotateServiceIdentity'),
      revokeServiceIdentity: document.getElementById('revokeServiceIdentity'),
      status: document.getElementById('status'),
      installationCount: document.getElementById('installationCount'),
      projectCount: document.getElementById('projectCount'),
      connectionCount: document.getElementById('connectionCount'),
      readinessValue: document.getElementById('readinessValue'),
      readinessNote: document.getElementById('readinessNote'),
      bindings: document.getElementById('bindings'),
      bindingNotes: document.getElementById('bindingNotes'),
      repoConnectionList: document.getElementById('repoConnectionList'),
      repoConnectionSummary: document.getElementById('repoConnectionSummary'),
      repoConnectionResult: document.getElementById('repoConnectionResult'),
      supportSummary: document.getElementById('supportSummary'),
      supportResult: document.getElementById('supportResult'),
      operationsSummary: document.getElementById('operationsSummary'),
      operationsResult: document.getElementById('operationsResult'),
      triagePolicySummary: document.getElementById('triagePolicySummary'),
      triagePolicyResult: document.getElementById('triagePolicyResult'),
      serviceIdentitySummary: document.getElementById('serviceIdentitySummary'),
      serviceIdentityResult: document.getElementById('serviceIdentityResult'),
      installLinkSummary: document.getElementById('installLinkSummary'),
      installLinkResult: document.getElementById('installLinkResult'),
      lookupSummary: document.getElementById('lookupSummary'),
      lookupResult: document.getElementById('lookupResult'),
      reconcileSummary: document.getElementById('reconcileSummary'),
      reconcileResult: document.getElementById('reconcileResult'),
      transferSummary: document.getElementById('transferSummary'),
      transferResult: document.getElementById('transferResult'),
      widgetSummary: document.getElementById('widgetSummary'),
      widgetResult: document.getElementById('widgetResult')
    };

    function setStatus(message) { els.status.textContent = message; }
    function authHeaders() {
      const token = els.token.value.trim();
      return token ? { Authorization: 'Bearer ' + token } : {};
    }
    function readState() {
      try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
    }
    function saveState() {
      localStorage.setItem(storageKey, JSON.stringify({
        baseUrl: els.baseUrl.value.trim(),
        token: els.token.value.trim(),
        workspaceId: els.workspaceId.value.trim(),
        projectId: els.projectId.value.trim(),
        projectKey: els.projectKey.value.trim(),
        repository: els.repository.value.trim(),
        installationId: els.installationId.value.trim(),
        githubInstallationRecordId: els.githubInstallationRecordId.value.trim(),
        repoConnectionId: els.repoConnectionId.value.trim(),
        repoConnectionStatus: els.repoConnectionStatus.value,
        repoConnectionDefault: els.repoConnectionDefault.value,
        repoConnectionConfig: els.repoConnectionConfig.value,
        origin: els.origin.value.trim(),
        mode: els.mode.value,
        triagePolicyJson: els.triagePolicyJson.value,
        serviceIdentityId: els.serviceIdentityId.value.trim(),
        serviceIdentityScopes: els.serviceIdentityScopes.value.trim()
      }));
    }
    async function request(path, init) {
      const response = await fetch((els.baseUrl.value.trim() || window.location.origin) + path, init);
      const text = await response.text();
      if (!response.ok) {
        throw new Error((init && init.method ? init.method : 'GET') + ' ' + path + ' failed: ' + response.status + ' ' + text);
      }
      return JSON.parse(text);
    }
    function writeJson(target, data) { target.textContent = JSON.stringify(data, null, 2); }
    function parseScopes() {
      return els.serviceIdentityScopes.value.split(',').map(function (value) { return value.trim(); }).filter(Boolean);
    }
    function parseDefaultSelection() {
      if (els.repoConnectionDefault.value === 'true') {
        return true;
      }
      if (els.repoConnectionDefault.value === 'false') {
        return false;
      }
      return undefined;
    }
    function parseRepoConfig() {
      const raw = els.repoConnectionConfig.value.trim();
      if (!raw) {
        return undefined;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Repo Connection Config must be a JSON object.');
      }
      return parsed;
    }
    function parseTriagePolicyConfig() {
      const raw = els.triagePolicyJson.value.trim();
      if (!raw) {
        return { ownershipRules: [], priorityRules: [] };
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Workspace Triage Policy must be a JSON object.');
      }
      return parsed;
    }
    function setReadiness(value, note) {
      els.readinessValue.textContent = value || 'unknown';
      els.readinessNote.textContent = note || 'Load a support snapshot to score project readiness.';
    }
    function renderTriagePolicy(result) {
      const summary = result && result.summary ? result.summary : {};
      const policy = result && result.policy ? result.policy : null;
      if (policy) {
        els.triagePolicyJson.value = JSON.stringify({ ownershipRules: policy.ownershipRules || [], priorityRules: policy.priorityRules || [] }, null, 2);
      }
      writeJson(els.triagePolicyResult, result);
      els.triagePolicySummary.textContent = summary.configured
        ? 'Configured. Ownership rules ' + (summary.ownershipRuleCount || 0) + '. Priority rules ' + (summary.priorityRuleCount || 0) + '. Updated ' + (summary.updatedAt || 'unknown') + '.'
        : 'No workspace triage policy is configured yet.';
    }
    function applyProjectLookup(result) {
      const project = result && result.project ? result.project : result;
      const workspace = result && result.workspace ? result.workspace : null;
      if (workspace && workspace.id) {
        els.workspaceId.value = workspace.id;
      }
      if (project && project.id) {
        els.projectId.value = project.id;
      }
      if (project && project.projectKey) {
        els.projectKey.value = project.projectKey;
      }
    }
    function selectRepoConnection(connection) {
      els.repoConnectionId.value = connection.id || '';
      els.repository.value = connection.repository || '';
      els.githubInstallationRecordId.value = connection.githubInstallationId || '';
      els.repoConnectionStatus.value = connection.status || '';
      els.repoConnectionDefault.value = connection.isDefault ? 'true' : 'false';
      els.repoConnectionConfig.value = JSON.stringify(connection.config || {}, null, 2);
      els.repoConnectionSummary.textContent = 'Loaded ' + connection.repository + ' into the editor.';
    }
    function renderBindings(projects, installations, repoConnections) {
      contextState.projects = Array.isArray(projects) ? projects : [];
      contextState.installations = Array.isArray(installations) ? installations : [];
      contextState.repoConnections = Array.isArray(repoConnections) ? repoConnections : [];
      els.projectCount.textContent = String(contextState.projects.length);
      els.installationCount.textContent = String(contextState.installations.length);
      els.connectionCount.textContent = String(contextState.repoConnections.length);
      els.bindings.innerHTML = '';
      els.repoConnectionList.innerHTML = '';
      const pills = [];
      contextState.projects.forEach(function (project) {
        pills.push('project:' + project.name + ' (' + project.projectKey + ')');
      });
      contextState.installations.forEach(function (installation) {
        pills.push('install:' + installation.installationId + (installation.accountLogin ? ' @' + installation.accountLogin : ''));
      });
      contextState.repoConnections.forEach(function (connection) {
        pills.push('repo:' + connection.repository + (connection.githubInstallationId ? ' linked' : ' unlinked') + (connection.isDefault ? ' default' : ''));
        const button = document.createElement('button');
        button.className = 'secondary mini';
        button.textContent = connection.repository + ' [' + connection.status + (connection.isDefault ? ', default' : '') + ']';
        button.addEventListener('click', function () { selectRepoConnection(connection); });
        els.repoConnectionList.appendChild(button);
      });
      if (!pills.length) {
        els.bindingNotes.textContent = 'No bindings found for the current ids yet. Manual reconcile or direct repo connection creation is the fastest way to attach a project.';
      } else {
        els.bindingNotes.textContent = 'Loaded ' + contextState.projects.length + ' project(s), ' + contextState.installations.length + ' installation(s), and ' + contextState.repoConnections.length + ' repo connection(s).';
      }
      pills.forEach(function (value) {
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = value;
        els.bindings.appendChild(pill);
      });
    }
    async function lookupProjectByKey() {
      saveState();
      const projectKey = els.projectKey.value.trim();
      if (!projectKey) {
        setStatus('Project Key is required.');
        return;
      }
      setStatus('Looking up project ' + projectKey + '...');
      try {
        const result = await request('/internal/projects/key/' + encodeURIComponent(projectKey), { headers: authHeaders() });
        applyProjectLookup(result);
        writeJson(els.operationsResult, result);
        els.operationsSummary.textContent = 'Resolved ' + (result.project ? result.project.name : projectKey) + ' from the project key lookup.';
        setStatus('Project lookup loaded for ' + projectKey + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to look up project by key.');
      }
    }
    async function loadContext() {
      saveState();
      const workspaceId = els.workspaceId.value.trim();
      if (!workspaceId) {
        setStatus('Workspace Id is required.');
        return;
      }
      setStatus('Loading workspace context for ' + workspaceId + '...');
      try {
        const results = await Promise.all([
          request('/internal/workspaces/' + workspaceId + '/projects', { headers: authHeaders() }),
          request('/internal/workspaces/' + workspaceId + '/github-installations', { headers: authHeaders() }),
          els.projectId.value.trim() ? request('/internal/projects/' + els.projectId.value.trim() + '/repo-connections', { headers: authHeaders() }) : Promise.resolve([]),
          request('/internal/workspaces/' + workspaceId + '/triage-policy', { headers: authHeaders() })
        ]);
        const projects = results[0];
        const installations = results[1];
        const repoConnections = results[2];
        const triagePolicy = results[3];
        if (!els.projectId.value.trim() && Array.isArray(projects) && projects.length === 1) {
          els.projectId.value = projects[0].id;
          els.projectKey.value = projects[0].projectKey;
        }
        renderBindings(projects, installations, repoConnections);
        renderTriagePolicy(triagePolicy);
        setStatus('Loaded onboarding context for workspace ' + workspaceId + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to load onboarding context.');
      }
    }
    async function loadOperations() {
      saveState();
      const projectId = els.projectId.value.trim();
      if (!projectId) {
        setStatus('Project Id is required.');
        return;
      }
      setStatus('Loading operations for ' + projectId + '...');
      try {
        const result = await request('/internal/projects/' + projectId + '/operations', { headers: authHeaders() });
        if (result.workspace && result.workspace.id) {
          els.workspaceId.value = result.workspace.id;
        }
        writeJson(els.operationsResult, result);
        writeJson(els.supportResult, result.support || {});
        const defaultRepository = result.repositories && result.repositories.defaultRepository ? result.repositories.defaultRepository : 'none';
        const pendingReviewCount = result.reports && typeof result.reports.pendingReviewCount === 'number' ? result.reports.pendingReviewCount : 0;
        const taskCount = result.agentTasks && typeof result.agentTasks.total === 'number' ? result.agentTasks.total : 0;
        const triagePolicySummary = result.triagePolicy || {};
        els.operationsSummary.textContent = 'Default repo ' + defaultRepository + '. Pending review ' + pendingReviewCount + '. Agent tasks ' + taskCount + '. Policy rules ' + ((triagePolicySummary.ownershipRuleCount || 0) + (triagePolicySummary.priorityRuleCount || 0)) + '.';
        const support = result.support || {};
        const issues = Array.isArray(support.issues) ? support.issues : [];
        const feedbackCount = Array.isArray(support.recentHostedFeedback) ? support.recentHostedFeedback.length : 0;
        const policyNote = support.triagePolicySummary && support.triagePolicySummary.configured
          ? ' Policy configured with ' + ((support.triagePolicySummary.ownershipRuleCount || 0) + (support.triagePolicySummary.priorityRuleCount || 0)) + ' rules.'
          : ' No triage policy configured.';
        els.supportSummary.textContent = 'Readiness ' + (support.readiness || 'unknown') + '. Recent hosted feedback ' + feedbackCount + '. ' + (issues[0] || 'No open support blockers.') + policyNote;
        if (result.triagePolicy) {
          renderTriagePolicy({ workspace: result.workspace, policy: result.triagePolicy.policy || null, summary: result.triagePolicy });
        }
        setReadiness(support.readiness || 'unknown', issues.length ? issues.join(' ') : 'Project is ready for customer handoff.');
        setStatus('Operations loaded for ' + projectId + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to load project operations.');
      }
    }
    async function loadTriagePolicy() {
      saveState();
      const workspaceId = els.workspaceId.value.trim();
      if (!workspaceId) {
        setStatus('Workspace Id is required.');
        return;
      }
      setStatus('Loading triage policy for ' + workspaceId + '...');
      try {
        const result = await request('/internal/workspaces/' + workspaceId + '/triage-policy', { headers: authHeaders() });
        renderTriagePolicy(result);
        setStatus('Triage policy loaded for ' + workspaceId + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to load triage policy.');
      }
    }
    async function saveTriagePolicy() {
      saveState();
      const workspaceId = els.workspaceId.value.trim();
      if (!workspaceId) {
        setStatus('Workspace Id is required.');
        return;
      }
      setStatus('Saving triage policy for ' + workspaceId + '...');
      try {
        const result = await request('/internal/workspaces/' + workspaceId + '/triage-policy', {
          method: 'PUT',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify(parseTriagePolicyConfig())
        });
        renderTriagePolicy(result);
        await loadOperations();
        setStatus('Triage policy saved for ' + workspaceId + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to save triage policy.');
      }
    }
    async function deleteTriagePolicy() {
      saveState();
      const workspaceId = els.workspaceId.value.trim();
      if (!workspaceId) {
        setStatus('Workspace Id is required.');
        return;
      }
      setStatus('Deleting triage policy for ' + workspaceId + '...');
      try {
        const result = await request('/internal/workspaces/' + workspaceId + '/triage-policy', {
          method: 'DELETE',
          headers: authHeaders()
        });
        els.triagePolicyJson.value = '';
        renderTriagePolicy(result);
        await loadOperations();
        setStatus('Triage policy deleted for ' + workspaceId + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to delete triage policy.');
      }
    }
    async function createRepoConnection() {
      saveState();
      const projectId = els.projectId.value.trim();
      const repository = els.repository.value.trim();
      if (!projectId || !repository) {
        setStatus('Project Id and Repository are required.');
        return;
      }
      setStatus('Creating repo connection for ' + repository + '...');
      try {
        const payload = {
          projectId: projectId,
          repository: repository,
          githubInstallationId: els.githubInstallationRecordId.value.trim() || undefined,
          isDefault: parseDefaultSelection(),
          config: parseRepoConfig()
        };
        const result = await request('/internal/repo-connections', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify(payload)
        });
        writeJson(els.repoConnectionResult, result);
        els.repoConnectionSummary.textContent = 'Created ' + result.repository + ' (' + result.id + ').';
        selectRepoConnection(result);
        await loadContext();
        await loadOperations();
        setStatus('Repo connection created for ' + repository + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to create repo connection.');
      }
    }
    async function updateRepoConnection() {
      saveState();
      const repoConnectionId = els.repoConnectionId.value.trim();
      if (!repoConnectionId) {
        setStatus('Repo Connection Id is required.');
        return;
      }
      setStatus('Updating repo connection ' + repoConnectionId + '...');
      try {
        const payload = {};
        const repository = els.repository.value.trim();
        const githubInstallationRecordId = els.githubInstallationRecordId.value.trim();
        const config = parseRepoConfig();
        if (repository) {
          payload.repository = repository;
        }
        if (githubInstallationRecordId) {
          payload.githubInstallationId = githubInstallationRecordId;
        }
        if (els.repoConnectionStatus.value) {
          payload.status = els.repoConnectionStatus.value;
        }
        const defaultSelection = parseDefaultSelection();
        if (typeof defaultSelection === 'boolean') {
          payload.isDefault = defaultSelection;
        }
        if (config) {
          payload.config = config;
        }
        const result = await request('/internal/repo-connections/' + encodeURIComponent(repoConnectionId), {
          method: 'PATCH',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify(payload)
        });
        writeJson(els.repoConnectionResult, result);
        els.repoConnectionSummary.textContent = 'Updated ' + result.repository + ' (' + result.id + ').';
        selectRepoConnection(result);
        await loadContext();
        await loadOperations();
        setStatus('Repo connection ' + repoConnectionId + ' updated.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to update repo connection.');
      }
    }
    async function listServiceIdentities() {
      saveState();
      setStatus('Loading service identities...');
      try {
        const result = await request('/internal/service-identities', { headers: authHeaders() });
        writeJson(els.serviceIdentityResult, result);
        const count = Array.isArray(result) ? result.length : 0;
        els.serviceIdentitySummary.textContent = 'Loaded ' + count + ' service ' + (count === 1 ? 'identity.' : 'identities.');
        setStatus('Service identities loaded.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to load service identities.');
      }
    }
    async function createServiceIdentity() {
      saveState();
      const scopes = parseScopes();
      if (!scopes.length) {
        setStatus('At least one service identity scope is required.');
        return;
      }
      setStatus('Creating service identity...');
      try {
        const result = await request('/internal/service-identities', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ id: els.serviceIdentityId.value.trim() || undefined, scopes: scopes })
        });
        writeJson(els.serviceIdentityResult, result);
        els.serviceIdentitySummary.textContent = 'Created ' + ((result.identity && result.identity.id) || 'service identity') + '. Copy token from the response panel.';
        if (result.identity && result.identity.id) {
          els.serviceIdentityId.value = result.identity.id;
        }
        setStatus('Service identity created.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to create service identity.');
      }
    }
    async function rotateServiceIdentity() {
      saveState();
      const identityId = els.serviceIdentityId.value.trim();
      if (!identityId) {
        setStatus('Service Identity Id is required.');
        return;
      }
      setStatus('Rotating ' + identityId + '...');
      try {
        const scopes = parseScopes();
        const payload = scopes.length ? { scopes: scopes } : {};
        const result = await request('/internal/service-identities/' + encodeURIComponent(identityId) + '/rotate', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify(payload)
        });
        writeJson(els.serviceIdentityResult, result);
        els.serviceIdentitySummary.textContent = 'Rotated ' + identityId + '. New token is shown in the response panel.';
        setStatus('Service identity ' + identityId + ' rotated.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to rotate service identity.');
      }
    }
    async function revokeServiceIdentity() {
      saveState();
      const identityId = els.serviceIdentityId.value.trim();
      if (!identityId) {
        setStatus('Service Identity Id is required.');
        return;
      }
      setStatus('Revoking ' + identityId + '...');
      try {
        const result = await request('/internal/service-identities/' + encodeURIComponent(identityId) + '/revoke', {
          method: 'POST',
          headers: authHeaders()
        });
        writeJson(els.serviceIdentityResult, result);
        els.serviceIdentitySummary.textContent = 'Revoked ' + identityId + '.';
        setStatus('Service identity ' + identityId + ' revoked.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to revoke service identity.');
      }
    }
    async function createInstallLink() {
      saveState();
      const workspaceId = els.workspaceId.value.trim();
      if (!workspaceId) {
        setStatus('Workspace Id is required.');
        return;
      }
      setStatus('Creating GitHub App install link...');
      try {
        const result = await request('/internal/workspaces/' + workspaceId + '/github-app/install-link', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            projectId: els.projectId.value.trim() || undefined,
            repository: els.repository.value.trim() || undefined,
            isDefault: true
          })
        });
        writeJson(els.installLinkResult, result);
        if (result.installUrl) {
          els.installLinkSummary.innerHTML = '<a class="inline-link" href="' + result.installUrl + '" target="_blank" rel="noreferrer">Open GitHub install flow</a> | callback ' + result.callbackUrl;
        } else {
          els.installLinkSummary.textContent = 'Install link created.';
        }
        setStatus('GitHub App install link generated.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to create install link.');
      }
    }
    async function lookupInstall() {
      saveState();
      const installationId = els.installationId.value.trim();
      if (!installationId) {
        setStatus('Installation Id is required.');
        return;
      }
      setStatus('Looking up installation ' + installationId + '...');
      try {
        const result = await request('/internal/github-app/installations/' + installationId, { headers: authHeaders() });
        writeJson(els.lookupResult, result);
        if (result.workspace) {
          els.lookupSummary.textContent = 'Mapped to ' + result.workspace.name + ' with ' + (Array.isArray(result.linkedProjects) ? result.linkedProjects.length : 0) + ' linked project binding(s).';
        } else {
          els.lookupSummary.textContent = 'Installation lookup completed.';
        }
        setStatus('Installation ' + installationId + ' loaded.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to look up installation.');
      }
    }
    async function reconcileInstall() {
      saveState();
      const workspaceId = els.workspaceId.value.trim();
      const installationId = els.installationId.value.trim();
      if (!workspaceId || !installationId) {
        setStatus('Workspace Id and Installation Id are required.');
        return;
      }
      setStatus('Reconciling installation ' + installationId + '...');
      try {
        const result = await request('/internal/workspaces/' + workspaceId + '/github-app/reconcile', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            installationId: installationId,
            projectId: els.projectId.value.trim() || undefined,
            repository: els.repository.value.trim() || undefined,
            isDefault: true
          })
        });
        writeJson(els.reconcileResult, result);
        els.reconcileSummary.textContent = result.repositoryLink ? result.repositoryLink.result + '. Linked repo: ' + (result.repositoryLink.linked || 'none') + '.' : 'Installation reconciled.';
        if (result.repositoryLink && result.repositoryLink.repoConnectionId) {
          els.repoConnectionId.value = result.repositoryLink.repoConnectionId;
        }
        await loadContext();
        await loadOperations();
        setStatus('Installation ' + installationId + ' reconciled.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to reconcile install.');
      }
    }
    async function transferInstall() {
      saveState();
      const workspaceId = els.workspaceId.value.trim();
      const installationId = els.installationId.value.trim();
      if (!workspaceId || !installationId) {
        setStatus('Workspace Id and Installation Id are required.');
        return;
      }
      setStatus('Transferring installation ' + installationId + '...');
      try {
        const result = await request('/internal/workspaces/' + workspaceId + '/github-app/transfer-installation', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            installationId: installationId,
            projectId: els.projectId.value.trim() || undefined,
            repository: els.repository.value.trim() || undefined,
            isDefault: true
          })
        });
        writeJson(els.transferResult, result);
        els.transferSummary.textContent = 'Transferred from ' + (result.sourceWorkspace ? result.sourceWorkspace.name : 'unknown') + ' to ' + (result.targetWorkspace ? result.targetWorkspace.name : 'unknown') + '. Deactivated ' + (Array.isArray(result.deactivatedConnectionIds) ? result.deactivatedConnectionIds.length : 0) + ' source connection(s).';
        await loadContext();
        await loadOperations();
        setStatus('Installation ' + installationId + ' transferred.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to transfer install.');
      }
    }
    async function mintWidget() {
      saveState();
      const projectId = els.projectId.value.trim();
      if (!projectId) {
        setStatus('Project Id is required to mint a widget session.');
        return;
      }
      setStatus('Minting widget session for ' + projectId + '...');
      try {
        const result = await request('/internal/projects/' + projectId + '/widget-session', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            origin: els.origin.value.trim() || undefined,
            mode: els.mode.value
          })
        });
        writeJson(els.widgetResult, result);
        const links = [];
        if (result.widgetUrl) {
          links.push('widget ' + result.widgetUrl);
        }
        if (result.embedScriptUrl) {
          links.push('embed ' + result.embedScriptUrl);
        }
        els.widgetSummary.textContent = links.join(' | ') || 'Widget session minted.';
        setStatus('Widget session minted for ' + projectId + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to mint widget session.');
      }
    }

    const saved = readState();
    els.baseUrl.value = saved.baseUrl || window.location.origin;
    els.token.value = saved.token || '';
    els.workspaceId.value = saved.workspaceId || '';
    els.projectId.value = saved.projectId || '';
    els.projectKey.value = saved.projectKey || '';
    els.repository.value = saved.repository || '';
    els.installationId.value = saved.installationId || '';
    els.githubInstallationRecordId.value = saved.githubInstallationRecordId || '';
    els.repoConnectionId.value = saved.repoConnectionId || '';
    els.repoConnectionStatus.value = saved.repoConnectionStatus || '';
    els.repoConnectionDefault.value = saved.repoConnectionDefault || 'auto';
    els.repoConnectionConfig.value = saved.repoConnectionConfig || '';
    els.origin.value = saved.origin || '';
    els.mode.value = saved.mode || 'embed';
    els.triagePolicyJson.value = saved.triagePolicyJson || '';
    els.serviceIdentityId.value = saved.serviceIdentityId || '';
    els.serviceIdentityScopes.value = saved.serviceIdentityScopes || 'internal:read';
    els.lookupProject.addEventListener('click', lookupProjectByKey);
    els.loadContext.addEventListener('click', loadContext);
    els.loadOperations.addEventListener('click', loadOperations);
    els.loadTriagePolicy.addEventListener('click', loadTriagePolicy);
    els.saveTriagePolicy.addEventListener('click', saveTriagePolicy);
    els.deleteTriagePolicy.addEventListener('click', deleteTriagePolicy);
    els.createRepoConnection.addEventListener('click', createRepoConnection);
    els.updateRepoConnection.addEventListener('click', updateRepoConnection);
    els.createInstallLink.addEventListener('click', createInstallLink);
    els.lookupInstall.addEventListener('click', lookupInstall);
    els.reconcileInstall.addEventListener('click', reconcileInstall);
    els.transferInstall.addEventListener('click', transferInstall);
    els.mintWidget.addEventListener('click', mintWidget);
    els.listServiceIdentities.addEventListener('click', listServiceIdentities);
    els.createServiceIdentity.addEventListener('click', createServiceIdentity);
    els.rotateServiceIdentity.addEventListener('click', rotateServiceIdentity);
    els.revokeServiceIdentity.addEventListener('click', revokeServiceIdentity);
  </script>
</body>
</html>`;
}

function buildSupportOpsPage(): string {
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
    .warn { color: var(--warn); }
    .danger { color: var(--danger); }
    .link-list { display: grid; gap: 8px; }
    .link-list a { color: var(--accent); text-decoration: none; word-break: break-all; }
    .activity-list { display: grid; gap: 10px; }
    .activity-item { border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(255,255,255,0.78); }
    pre { margin: 0; padding: 14px; border-radius: 18px; background: #201d1f; color: #f7efe3; overflow: auto; font: 0.82rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    @media (max-width: 1120px) { .shell, .summary-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow">Support Operations</span>
      <h1>Run customer support checks without leaving the control plane.</h1>
      <p>This page is focused on the live support workflow: resolve a project from a key, inspect its readiness snapshot, verify the current public widget and feedback links, watch recent hosted feedback, and jump straight into review or onboarding follow-up when something is off.</p>
    </section>
    <section class="shell">
      <aside class="panel">
        <div class="controls">
          <label>Base URL<input id="baseUrl" value="" placeholder="http://127.0.0.1:4000" /></label>
          <label>Bearer Token<input id="token" value="" placeholder="nexus-local-dev-token" /></label>
          <label>Project Key<input id="projectKey" value="" placeholder="checkout-prod" /></label>
          <label>Project Id<input id="projectId" value="" placeholder="project UUID optional" /></label>
          <div class="row">
            <button id="lookupProject" class="secondary">Lookup Project</button>
            <button id="loadSupport" class="primary">Load Support Snapshot</button>
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
          <article class="card"><span class="helper">Readiness</span><strong id="readinessValue">unknown</strong><span id="readinessNote" class="helper">Load a project support snapshot.</span></article>
          <article class="card"><span class="helper">Active Repos</span><strong id="repositoryCount">0</strong><span class="helper">Active repository connections in scope.</span></article>
          <article class="card"><span class="helper">Pending Review</span><strong id="pendingReviewCount">0</strong><span class="helper">Hosted feedback items still awaiting review.</span></article>
          <article class="card"><span class="helper">Recent Feedback</span><strong id="recentFeedbackCount">0</strong><span class="helper">Latest hosted feedback items visible from support.</span></article>
        </div>
        <section class="section">
          <h2 class="section-title">Checklist</h2>
          <div id="checklist" class="pill-list"></div>
          <div id="issues" class="helper">No support checks loaded yet.</div>
        </section>
        <section class="section">
          <h2 class="section-title">Operational Links</h2>
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
      lookupProject: document.getElementById('lookupProject'),
      loadSupport: document.getElementById('loadSupport'),
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
      links: document.getElementById('links'),
      recentFeedback: document.getElementById('recentFeedback'),
      result: document.getElementById('result')
    };
    let lastSupport = null;
    function setStatus(message) { els.status.textContent = message; }
    function authHeaders() {
      const token = els.token.value.trim();
      return token ? { Authorization: 'Bearer ' + token } : {};
    }
    function saveState() {
      localStorage.setItem(storageKey, JSON.stringify({
        baseUrl: els.baseUrl.value.trim(),
        token: els.token.value.trim(),
        projectKey: els.projectKey.value.trim(),
        projectId: els.projectId.value.trim()
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
    function renderLink(name, href) {
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      anchor.textContent = name + ': ' + href;
      els.links.appendChild(anchor);
    }
    function renderSupportSnapshot(result) {
      lastSupport = result;
      const support = result.support || {};
      const issues = Array.isArray(support.issues) ? support.issues : [];
      const checklist = support.checklist || {};
      const recentHostedFeedback = Array.isArray(support.recentHostedFeedback) ? support.recentHostedFeedback : [];
      els.result.textContent = JSON.stringify(result, null, 2);
      els.readinessValue.textContent = support.readiness || 'unknown';
      els.readinessNote.textContent = issues.length ? issues.join(' ') : 'Support checks look good for this project.';
      els.repositoryCount.textContent = String(Array.isArray(result.repositories && result.repositories.available) ? result.repositories.available.length : 0);
      els.pendingReviewCount.textContent = String(result.reports && typeof result.reports.pendingReviewCount === 'number' ? result.reports.pendingReviewCount : 0);
      els.recentFeedbackCount.textContent = String(recentHostedFeedback.length);
      els.checklist.innerHTML = '';
      els.links.innerHTML = '';
      els.recentFeedback.innerHTML = '';
      Object.entries(checklist).forEach(function (entry) {
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = entry[0] + ': ' + entry[1];
        els.checklist.appendChild(pill);
      });
      els.issues.className = 'helper' + (issues.length ? ' warn' : '');
      els.issues.textContent = issues.length ? issues.join(' ') : 'No open support blockers.';
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
    els.lookupProject.addEventListener('click', lookupProject);
    els.loadSupport.addEventListener('click', loadSupport);
    els.openReviewQueue.addEventListener('click', function () { openLink('review'); });
    els.openOnboarding.addEventListener('click', function () { openLink('onboarding'); });
    if (els.projectId.value || els.projectKey.value) {
      loadSupport().catch(function () { return undefined; });
    }
  </script>
</body>
</html>`;
}

function buildReviewQueuePage(): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>Nexus Review Queue</title>',
    '  <style>',
    '    :root { color-scheme: light; --bg-top: #f8f1dd; --bg-bottom: #d7e2db; --ink: #18212b; --muted: rgba(24,33,43,0.68); --panel: rgba(255,255,255,0.84); --panel-strong: rgba(255,255,255,0.94); --line: rgba(24,33,43,0.12); --accent: #0d5e55; --accent-soft: rgba(13,94,85,0.12); --accent-ink: #0a3d37; --good: #0f6b46; --bad: #922f2f; --warn: #8b6208; --shadow: 0 22px 56px rgba(24,33,43,0.12); }',
    '    * { box-sizing: border-box; }',
    '    body { margin: 0; font-family: "Iowan Old Style", Georgia, serif; color: var(--ink); background: radial-gradient(circle at top left, #fff8eb 0%, var(--bg-top) 36%, var(--bg-bottom) 100%); }',
    '    main { max-width: 1340px; margin: 0 auto; padding: 36px 18px 60px; }',
    '    h1 { margin: 0 0 10px; font-size: clamp(2.7rem, 5vw, 5rem); line-height: 0.92; max-width: 12ch; }',
    '    p { color: var(--muted); max-width: 76ch; line-height: 1.6; }',
    '    .eyebrow { display: inline-block; margin-bottom: 14px; padding: 8px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font: 600 0.76rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.08em; }',
    '    .hero { display: grid; gap: 20px; }',
    '    .hero-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.9fr); gap: 18px; align-items: end; }',
    '    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }',
    '    .summary-card { background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.76)); border: 1px solid rgba(255,255,255,0.5); border-radius: 24px; padding: 18px; box-shadow: var(--shadow); min-height: 120px; }',
    '    .summary-label { display: block; color: var(--muted); font: 600 0.78rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.08em; }',
    '    .summary-value { display: block; margin-top: 10px; font-size: clamp(1.8rem, 4vw, 3rem); line-height: 0.95; }',
    '    .summary-note { margin-top: 10px; font-size: 0.95rem; color: var(--muted); }',
    '    .shell { display: grid; grid-template-columns: 390px minmax(0, 1fr); gap: 18px; margin-top: 28px; }',
    '    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 28px; box-shadow: var(--shadow); overflow: hidden; backdrop-filter: blur(10px); }',
    '    .controls { padding: 18px; display: grid; gap: 12px; }',
    '    label { display: grid; gap: 6px; font-size: 0.92rem; color: var(--muted); }',
    '    input, textarea, button, select { font: inherit; }',
    '    input, textarea, select { width: 100%; border: 1px solid var(--line); border-radius: 14px; padding: 11px 12px; background: var(--panel-strong); color: var(--ink); }',
    '    textarea { min-height: 96px; resize: vertical; }',
    '    button { border: none; border-radius: 14px; padding: 12px 14px; cursor: pointer; transition: transform 140ms ease, opacity 140ms ease; }',
    '    button:hover { transform: translateY(-1px); }',
    '    button.primary { background: var(--accent); color: #fffaf6; }',
    '    button.secondary { background: rgba(255,255,255,0.86); border: 1px solid var(--line); color: var(--ink); }',
    '    button.success { background: var(--good); color: white; }',
    '    button.danger { background: var(--bad); color: white; }',
    '    button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }',
    '    .list { display: grid; gap: 10px; padding: 0 18px 18px; max-height: 640px; overflow: auto; }',
    '    .item { width: 100%; text-align: left; border: 1px solid var(--line); border-radius: 20px; padding: 14px; background: rgba(255,255,255,0.72); cursor: pointer; }',
    '    .item.active { border-color: rgba(13,94,85,0.45); box-shadow: inset 0 0 0 1px rgba(13,94,85,0.2); background: rgba(239,249,246,0.96); }',
    '    .item-header { display: flex; gap: 10px; align-items: flex-start; }',
    '    .item-check { margin-top: 2px; width: 18px; height: 18px; accent-color: var(--accent); }',
    '    .item h3 { margin: 0 0 8px; font-size: 1.04rem; }',
    '    .meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.8rem; color: var(--muted); }',
    '    .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 6px 9px; background: #eef4f2; }',
    '    .stack { display: grid; gap: 14px; }',
    '    .summary-strip { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }',
    '    .mini-card { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,0.78); }',
    '    .bulk-box { display: grid; gap: 10px; }',
    '    .project-pills { display: flex; flex-wrap: wrap; gap: 10px; }',
    '    .project-pill { border: 1px solid var(--line); background: rgba(255,255,255,0.72); color: var(--ink); padding: 10px 12px; border-radius: 16px; text-align: left; }',
    '    .project-pill.active { background: rgba(13,94,85,0.14); border-color: rgba(13,94,85,0.35); color: var(--accent-ink); }',
    '    .workspace { padding: 18px; display: grid; gap: 16px; min-height: 760px; }',
    '    .workspace pre { margin: 0; padding: 14px; border-radius: 16px; background: #231f20; color: #f7efe3; overflow: auto; font: 0.82rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }',
    '    .empty { display: grid; place-items: center; min-height: 280px; color: var(--muted); border: 1px dashed var(--line); border-radius: 18px; }',
    '    .split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }',
    '    .status { padding: 12px 14px; border-top: 1px solid var(--line); background: rgba(31,36,48,0.03); color: var(--muted); min-height: 48px; }',
    '    .row { display: flex; gap: 10px; flex-wrap: wrap; }',
    '    .row.spread { justify-content: space-between; align-items: center; }',
    '    .section-title { margin: 0; font-size: 0.9rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }',
    '    .helper { font-size: 0.85rem; color: var(--muted); }',
    '    .timeline { display: grid; gap: 10px; }',
    '    .timeline-entry { border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(255,255,255,0.78); }',
    '    .timeline-entry strong { display: block; margin-bottom: 4px; }',
    '    .pager { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 0 18px 18px; }',
    '    .pager-group { display: flex; gap: 10px; align-items: center; }',
    '    @media (max-width: 1120px) { .hero-grid, .shell, .split { grid-template-columns: 1fr; } .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',
    '    @media (max-width: 680px) { .summary-grid { grid-template-columns: 1fr; } main { padding-inline: 12px; } }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <section class="hero">',
    '      <span class="eyebrow">Operator Review Console</span>',
    '      <div class="hero-grid">',
    '        <div>',
    '          <h1>Review hosted feedback before it lands in GitHub.</h1>',
    '          <p>This queue now pages through pending hosted feedback, surfaces project-level hotspots, and lets an operator approve or reject each draft using the same internal review endpoints the control plane exposes.</p>',
    '        </div>',
    '        <div class="summary-grid">',
    '          <article class="summary-card"><span class="summary-label">Queued</span><span id="queuedCount" class="summary-value">0</span><span class="summary-note" id="queuedNote">Pending reports across the current filter.</span></article>',
    '          <article class="summary-card"><span class="summary-label">Critical</span><span id="criticalCount" class="summary-value">0</span><span class="summary-note">Critical hosted feedback waiting on review.</span></article>',
    '          <article class="summary-card"><span class="summary-label">Projects</span><span id="projectCount" class="summary-value">0</span><span class="summary-note">Projects represented in this queue slice.</span></article>',
    '          <article class="summary-card"><span class="summary-label">Page</span><span id="pageValue" class="summary-value">1</span><span class="summary-note" id="pageNote">Queue page and sort state.</span></article>',
    '        </div>',
    '      </div>',
    '    </section>',
    '    <section class="shell">',
    '      <aside class="panel">',
    '        <div class="controls">',
    '          <label>Base URL<input id="baseUrl" value="" placeholder="http://127.0.0.1:4000" /></label>',
    '          <label>Bearer Token<input id="token" value="" placeholder="nexus-local-dev-token" /></label>',
    '          <label>Project Id Filter<input id="projectId" value="" placeholder="Optional project UUID" /></label>',
    '          <label>Assigned To<input id="assignedTo" value="" placeholder="Filter by reviewer or operator id" /></label>',
    '          <label>Search Queue<input id="search" value="" placeholder="Project, repo, title, reporter" /></label>',
    '          <label>Sort By<select id="sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="impact">Highest impact</option><option value="severity">Highest severity</option></select></label>',
    '          <div class="row">',
    '            <button id="refresh" class="primary">Refresh Queue</button>',
    '            <button id="clearToken" class="secondary">Clear Saved Auth</button>',
    '          </div>',
    '          <div class="stack">',
    '            <h2 class="section-title">Project Hotspots</h2>',
    '            <div id="projectSummaries" class="project-pills"></div>',
    '          </div>',
    '          <div class="bulk-box">',
    '            <h2 class="section-title">Bulk Actions</h2>',
    '            <label>Assign Selected To<input id="bulkReviewerId" value="" placeholder="defaults to your operator id" /></label>',
    '            <label>Bulk Repository Override<input id="bulkRepository" value="" placeholder="owner/repo optional" /></label>',
    '            <label>Bulk Notes<textarea id="bulkNotes" placeholder="Applied to selected queued reports."></textarea></label>',
    '            <div class="row">',
    '              <button id="assignSelected" class="secondary">Assign</button>',
    '              <button id="approveSelected" class="success">Approve</button>',
    '              <button id="rejectSelected" class="danger">Reject</button>',
    '              <button id="clearSelection" class="secondary">Clear</button>',
    '            </div>',
    '          </div>',
    '        </div>',
    '        <div id="queue" class="list"></div>',
    '        <div class="pager">',
    '          <div class="pager-group">',
    '            <button id="previousPage" class="secondary">Previous</button>',
    '            <button id="nextPage" class="secondary">Next</button>',
    '          </div>',
    '          <div class="helper" id="pageSummary">Page 1</div>',
    '        </div>',
    '        <div id="queueStatus" class="status">Queue not loaded yet.</div>',
    '      </aside>',
    '      <section class="panel workspace">',
    '        <div class="summary-strip">',
    '          <article class="mini-card"><h2 class="section-title">Severity Mix</h2><div id="severitySummary" class="helper">No queue data loaded yet.</div></article>',
    '          <article class="mini-card"><h2 class="section-title">Filter State</h2><div id="filterSummary" class="helper">No filters applied.</div></article>',
    '          <article class="mini-card"><h2 class="section-title">Queue Window</h2><div id="windowSummary" class="helper">Waiting for queue data.</div></article>',
    '          <article class="mini-card"><h2 class="section-title">Workflow Health</h2><div id="workflowSummary" class="helper">No queue data loaded yet.</div></article>',
    '        </div>',
    '        <div class="split">',
    '          <div>',
    '            <h2 class="section-title">Selected Report</h2>',
    '            <div id="summary" class="empty">Select a queued report to inspect context.</div>',
    '          </div>',
    '          <div>',
    '            <h2 class="section-title">Decision</h2>',
    '            <label>Repository Override<input id="repository" value="" placeholder="owner/repo optional" /></label>',
    '            <label>Notes<textarea id="notes" placeholder="Record why this was approved or rejected."></textarea></label>',
    '            <div class="row">',
    '              <button id="approve" class="success" disabled>Approve</button>',
    '              <button id="reject" class="danger" disabled>Reject</button>',
    '            </div>',
    '          </div>',
    '        </div>',
    '        <div>',
    '          <h2 class="section-title">Context</h2>',
    '          <pre id="context">// report context appears here</pre>',
    '        </div>',
    '        <div>',
    '          <h2 class="section-title">Review Activity</h2>',
    '          <div id="reviewActivity" class="timeline"><div class="empty">Select a queued report to inspect review activity.</div></div>',
    '        </div>',
    '      </section>',
    '    </section>',
    '  </main>',
    '  <script>',
    '    const storageKey = "nexus-review-queue-auth";',
    '    const state = { items: [], selected: null, selectedIds: [], context: null, summary: null, filters: { page: 1, limit: 12, sort: "newest", projectId: "", assignedTo: "", search: "" } };',
    '    const els = {',
    '      baseUrl: document.getElementById("baseUrl"),',
    '      token: document.getElementById("token"),',
    '      projectId: document.getElementById("projectId"),',
    '      assignedTo: document.getElementById("assignedTo"),',
    '      search: document.getElementById("search"),',
    '      sort: document.getElementById("sort"),',
    '      refresh: document.getElementById("refresh"),',
    '      clearToken: document.getElementById("clearToken"),',
    '      previousPage: document.getElementById("previousPage"),',
    '      nextPage: document.getElementById("nextPage"),',
    '      queue: document.getElementById("queue"),',
    '      queueStatus: document.getElementById("queueStatus"),',
    '      bulkReviewerId: document.getElementById("bulkReviewerId"),',
    '      bulkRepository: document.getElementById("bulkRepository"),',
    '      bulkNotes: document.getElementById("bulkNotes"),',
    '      assignSelected: document.getElementById("assignSelected"),',
    '      approveSelected: document.getElementById("approveSelected"),',
    '      rejectSelected: document.getElementById("rejectSelected"),',
    '      clearSelection: document.getElementById("clearSelection"),',
    '      projectSummaries: document.getElementById("projectSummaries"),',
    '      pageSummary: document.getElementById("pageSummary"),',
    '      queuedCount: document.getElementById("queuedCount"),',
    '      queuedNote: document.getElementById("queuedNote"),',
    '      criticalCount: document.getElementById("criticalCount"),',
    '      projectCount: document.getElementById("projectCount"),',
    '      pageValue: document.getElementById("pageValue"),',
    '      pageNote: document.getElementById("pageNote"),',
    '      severitySummary: document.getElementById("severitySummary"),',
    '      filterSummary: document.getElementById("filterSummary"),',
    '      windowSummary: document.getElementById("windowSummary"),',
    '      workflowSummary: document.getElementById("workflowSummary"),',
    '      summary: document.getElementById("summary"),',
    '      repository: document.getElementById("repository"),',
    '      notes: document.getElementById("notes"),',
    '      approve: document.getElementById("approve"),',
    '      reject: document.getElementById("reject"),',
    '      context: document.getElementById("context"),',
    '      reviewActivity: document.getElementById("reviewActivity")',
    '    };',
    '    function readSaved() {',
    '      try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }',
    '    }',
    '    function saveAuth() {',
    '      localStorage.setItem(storageKey, JSON.stringify({ baseUrl: els.baseUrl.value.trim(), token: els.token.value.trim(), projectId: els.projectId.value.trim(), assignedTo: els.assignedTo.value.trim(), search: els.search.value.trim(), sort: els.sort.value }));',
    '    }',
    '    function setStatus(message) { els.queueStatus.textContent = message; }',
    '    function authHeaders() {',
    '      const token = els.token.value.trim();',
    '      return token ? { Authorization: `Bearer ${token}` } : {};',
    '    }',
    '    function escapeHtml(value) {',
    '      return String(value ?? "").replace(/[&<>"\']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "\'": "&#39;" }[character] || character));',
    '    }',
    '    function relativeTime(value) {',
    '      if (!value) return "unknown";',
    '      const milliseconds = Date.now() - new Date(value).getTime();',
    '      const minutes = Math.round(milliseconds / 60000);',
    '      if (!Number.isFinite(minutes)) return "unknown";',
    '      if (Math.abs(minutes) < 60) return `${minutes}m ago`;',
    '      const hours = Math.round(minutes / 60);',
    '      if (Math.abs(hours) < 48) return `${hours}h ago`;',
    '      const days = Math.round(hours / 24);',
    '      return `${days}d ago`;',
    '    }',
    '    function isSelected(reportId) { return state.selectedIds.includes(reportId); }',
    '    function clearSelection() { state.selectedIds = []; renderQueue(); renderSummary(); }',
    '    function toggleSelection(reportId) {',
    '      state.selectedIds = isSelected(reportId) ? state.selectedIds.filter((id) => id !== reportId) : [...state.selectedIds, reportId];',
    '      renderQueue();',
    '      renderSummary();',
    '    }',
    '    async function request(path, init) {',
    '      const baseUrl = els.baseUrl.value.trim() || window.location.origin;',
    '      const response = await fetch(baseUrl + path, init);',
    '      const text = await response.text();',
    '      if (!response.ok) { throw new Error(`${init && init.method ? init.method : "GET"} ${path} failed: ${response.status} ${text}`); }',
    '      return JSON.parse(text);',
    '    }',
    '    function renderSummary() {',
    '      const summary = state.summary;',
    '      const filters = state.filters;',
    '      const severityCounts = summary && summary.severityCounts ? summary.severityCounts : {};',
    '      const workflow = summary && summary.workflow ? summary.workflow : null;',
    '      const projectSummaries = summary && Array.isArray(summary.projectSummaries) ? summary.projectSummaries : [];',
    '      els.queuedCount.textContent = String(summary ? summary.totalItems : 0);',
    '      els.criticalCount.textContent = String(severityCounts.critical || 0);',
    '      els.projectCount.textContent = String(projectSummaries.length);',
    '      els.pageValue.textContent = String(filters.page);',
    '      els.pageNote.textContent = `${filters.sort} order | ${state.selectedIds.length} selected`;',
    '      els.queuedNote.textContent = summary ? `${summary.totalPages} page${summary.totalPages === 1 ? "" : "s"} in current queue filter.` : "Pending reports across the current filter.";',
    '      const severityText = Object.entries(severityCounts).length ? Object.entries(severityCounts).map(([key, value]) => `${key}: ${value}`).join(" | ") : "No queue data loaded yet.";',
    '      els.severitySummary.textContent = severityText;',
    '      const activeFilters = [filters.projectId ? `project ${filters.projectId}` : null, filters.assignedTo ? `assigned ${filters.assignedTo}` : null, filters.search ? `search \"${filters.search}\"` : null].filter(Boolean).join(" | ") || "No filters applied.";',
    '      els.filterSummary.textContent = activeFilters;',
    '      els.windowSummary.textContent = summary ? `${state.items.length} item${state.items.length === 1 ? "" : "s"} shown on page ${filters.page} of ${summary.totalPages}.` : "Waiting for queue data.";',
    '      els.workflowSummary.textContent = workflow ? `assigned ${workflow.assignedCount} | unassigned ${workflow.unassignedCount} | stale ${workflow.staleCount} | oldest ${workflow.oldestPendingAgeHours}h | avg ${workflow.averageAgeHours}h` : "No queue data loaded yet.";',
    '      els.pageSummary.textContent = summary ? `Page ${filters.page} of ${summary.totalPages}` : `Page ${filters.page}`;',
    '      els.previousPage.disabled = filters.page <= 1;',
    '      els.nextPage.disabled = !(summary && summary.hasNextPage);',
    '      els.projectSummaries.innerHTML = "";',
    '      const allButton = document.createElement("button");',
    '      allButton.type = "button";',
    '      allButton.className = `project-pill${filters.projectId ? "" : " active"}`;',
    '      allButton.textContent = `All projects (${summary ? summary.totalItems : 0})`;',
    '      allButton.addEventListener("click", () => { state.filters.page = 1; els.projectId.value = ""; loadQueue(); });',
    '      els.projectSummaries.appendChild(allButton);',
    '      for (const entry of projectSummaries) {',
    '        const button = document.createElement("button");',
    '        button.type = "button";',
    '        const projectId = entry.project && entry.project.id ? entry.project.id : "";',
    '        button.className = `project-pill${projectId && projectId === filters.projectId ? " active" : ""}`;',
    '        button.innerHTML = `<strong>${escapeHtml(entry.project ? entry.project.name : "Unscoped")}</strong><br /><span class="helper">${entry.queuedCount} queued | impact ${entry.highestImpactScore ?? "n/a"}</span>`;',
    '        button.addEventListener("click", () => { state.filters.page = 1; els.projectId.value = projectId; loadQueue(); });',
    '        els.projectSummaries.appendChild(button);',
    '      }',
    '    }',
    '    function renderQueue() {',
    '      els.queue.innerHTML = "";',
    '      if (!state.items.length) {',
    '        const empty = document.createElement("div");',
    '        empty.className = "empty";',
    '        empty.textContent = "No queued hosted-feedback reviews found.";',
    '        els.queue.appendChild(empty);',
    '        return;',
    '      }',
    '      for (const item of state.items) {',
    '        const card = document.createElement("button");',
    '        card.type = "button";',
    '        card.className = `item${state.selected && state.selected.reportId === item.reportId ? " active" : ""}`;',
    '        card.innerHTML = [`<div class="item-header"><input class="item-check" data-role="select" type="checkbox" ${isSelected(item.reportId) ? "checked" : ""} /><div><h3>${escapeHtml(item.title || item.reportId)}</h3><div class="meta"><span class="badge">${escapeHtml(item.project ? item.project.name : "Unscoped project")}</span><span class="badge">${escapeHtml(item.severity)}</span><span class="badge">impact ${item.impactScore ?? "n/a"}</span><span class="badge">${escapeHtml(relativeTime(item.createdAt))}</span></div><div class="helper">${escapeHtml(item.repository || "repository unresolved")} | owner ${escapeHtml(item.owner ? item.owner.label : "unresolved")} | ${escapeHtml(item.reporterIdentifier || "anonymous")} | assigned ${escapeHtml(item.assignedReviewerId || "unassigned")}</div></div></div>`].join("");',
    '        const checkbox = card.querySelector("[data-role=select]");',
    '        if (checkbox) { checkbox.addEventListener("click", (event) => { event.stopPropagation(); }); checkbox.addEventListener("change", () => toggleSelection(item.reportId)); }',
    '        card.addEventListener("click", () => selectItem(item));',
    '        els.queue.appendChild(card);',
    '      }',
    '    }',
    '    function renderSelection() {',
    '      const selected = state.selected;',
    '      const context = state.context;',
    '      const actionable = Boolean(selected);',
    '      els.approve.disabled = !actionable;',
    '      els.reject.disabled = !actionable;',
    '      if (!selected) {',
    '        els.summary.className = "empty";',
    '        els.summary.textContent = "Select a queued report to inspect context.";',
    '        els.context.textContent = "// report context appears here";',
    '        els.reviewActivity.innerHTML = `<div class="empty">Select a queued report to inspect review activity.</div>`;',
    '        return;',
    '      }',
    '      els.summary.className = "";',
    '      els.summary.innerHTML = [`<div class="row">`,`<span class="badge">${escapeHtml(selected.reportId)}</span>`,`<span class="badge">${escapeHtml(selected.repository || "repository unresolved")}</span>`,`<span class="badge">${escapeHtml(selected.severity)}</span>`,`<span class="badge">owner ${escapeHtml(selected.owner ? selected.owner.label : "unresolved")}</span>`,`<span class="badge">assigned ${escapeHtml(selected.assignedReviewerId || "unassigned")}</span>`,`</div>`,`<p><strong>${escapeHtml(selected.title)}</strong></p>`,`<p>${selected.project ? `${escapeHtml(selected.project.name)} (${escapeHtml(selected.project.projectKey)})` : "No project metadata"}</p>`,`<p>Reporter: ${escapeHtml(selected.reporterIdentifier || "anonymous")}</p>`,`<p class="helper">Created ${escapeHtml(relativeTime(selected.createdAt))} | Updated ${escapeHtml(relativeTime(selected.updatedAt))}</p>`].join("");',
    '      els.repository.value = selected.repository || "";',
    '      els.context.textContent = JSON.stringify(context || {}, null, 2);',
    '      const reviewActivity = Array.isArray(context && context.reviewActivity) ? context.reviewActivity : [];',
    '      els.reviewActivity.innerHTML = reviewActivity.length ? reviewActivity.map((entry) => [`<article class="timeline-entry">`,`<strong>${escapeHtml(entry.summary || entry.eventType || "Activity")}</strong>`,`<div class="helper">${escapeHtml(entry.eventType || "unknown")} | ${escapeHtml(relativeTime(entry.createdAt))} | actor ${escapeHtml(entry.actorId || entry.actorType || "unknown")}</div>`,`</article>`].join("")).join("") : `<div class="empty">No review activity has been recorded yet.</div>`;',
    '    }',
    '    async function loadQueue() {',
    '      saveAuth();',
    '      setStatus("Loading review queue...");',
    '      state.filters.projectId = els.projectId.value.trim();',
    '      state.filters.assignedTo = els.assignedTo.value.trim();',
    '      state.filters.search = els.search.value.trim();',
    '      state.filters.sort = els.sort.value;',
    '      const params = new URLSearchParams();',
    '      if (state.filters.projectId) params.set("projectId", state.filters.projectId);',
    '      if (state.filters.assignedTo) params.set("assignedTo", state.filters.assignedTo);',
    '      if (state.filters.search) params.set("search", state.filters.search);',
    '      params.set("page", String(state.filters.page));',
    '      params.set("limit", String(state.filters.limit));',
    '      params.set("sort", state.filters.sort);',
    '      try {',
    '        const data = await request(`/internal/reports/review-queue?${params.toString()}`, { headers: authHeaders() });',
    '        state.items = Array.isArray(data.items) ? data.items : [];',
    '        state.summary = data.summary || null;',
    '        state.selectedIds = state.selectedIds.filter((reportId) => state.items.some((item) => item.reportId === reportId));',
    '        state.filters.page = data.filters && typeof data.filters.page === "number" ? data.filters.page : state.filters.page;',
    '        if (state.selected) {',
    '          state.selected = state.items.find((item) => item.reportId === state.selected.reportId) || null;',
    '        }',
    '        renderSummary();',
    '        renderQueue();',
    '        renderSelection();',
    '        setStatus(`Loaded ${state.items.length} queued report${state.items.length === 1 ? "" : "s"} on page ${state.filters.page}.`);',
    '      } catch (error) {',
    '        state.summary = null;',
    '        renderSummary();',
    '        setStatus(error instanceof Error ? error.message : "Failed to load queue.");',
    '      }',
    '    }',
    '    async function selectItem(item) {',
    '      state.selected = item;',
    '      renderQueue();',
    '      setStatus(`Loading context for ${item.reportId}...`);',
    '      try {',
    '        state.context = await request(item.contextPath, { headers: authHeaders() });',
    '        renderSelection();',
    '        setStatus(`Loaded context for ${item.reportId}.`);',
    '      } catch (error) {',
    '        state.context = null;',
    '        renderSelection();',
    '        setStatus(error instanceof Error ? error.message : "Failed to load report context.");',
    '      }',
    '    }',
    '    async function submitReview(status) {',
    '      if (!state.selected) return;',
    '      setStatus(`${status === "approved" ? "Approving" : "Rejecting"} ${state.selected.reportId}...`);',
    '      try {',
    '        const payload = { status, notes: els.notes.value.trim() || undefined, repository: status === "approved" ? (els.repository.value.trim() || undefined) : undefined };',
    '        const result = await request(`/internal/reports/${state.selected.reportId}/review`, { method: "POST", headers: { "content-type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });',
    '        els.notes.value = "";',
    '        state.context = result;',
    '        await loadQueue();',
    '        setStatus(`${state.selected ? state.selected.reportId : "Report"} ${status}.`);',
    '      } catch (error) {',
    '        setStatus(error instanceof Error ? error.message : "Failed to submit review.");',
    '      }',
    '    }',
    '    async function submitBulkAction(action) {',
    '      if (!state.selectedIds.length) { setStatus("Select at least one queued report first."); return; }',
    '      setStatus(`${action} ${state.selectedIds.length} queued report(s)...`);',
    '      const payload = {',
    '        action,',
    '        reportIds: state.selectedIds,',
    '        reviewerId: action === "assign" ? (els.bulkReviewerId.value.trim() || undefined) : undefined,',
    '        repository: action === "approve" ? (els.bulkRepository.value.trim() || undefined) : undefined,',
    '        notes: els.bulkNotes.value.trim() || undefined',
    '      };',
    '      try {',
    '        await request(`/internal/reports/review-queue/actions`, { method: "POST", headers: { "content-type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });',
    '        els.bulkNotes.value = "";',
    '        if (action !== "assign") { els.bulkRepository.value = ""; }',
    '        clearSelection();',
    '        await loadQueue();',
    '        setStatus(`Bulk ${action} completed.`);',
    '      } catch (error) {',
    '        setStatus(error instanceof Error ? error.message : `Bulk ${action} failed.`);',
    '      }',
    '    }',
    '    const saved = readSaved();',
    '    els.baseUrl.value = saved.baseUrl || window.location.origin;',
    '    els.token.value = saved.token || "";',
    '    els.projectId.value = saved.projectId || "";',
    '    els.assignedTo.value = saved.assignedTo || "";',
    '    els.search.value = saved.search || "";',
    '    els.sort.value = saved.sort || "newest";',
    '    state.filters.projectId = els.projectId.value.trim();',
    '    state.filters.assignedTo = els.assignedTo.value.trim();',
    '    state.filters.search = els.search.value.trim();',
    '    state.filters.sort = els.sort.value;',
    '    els.refresh.addEventListener("click", () => { state.filters.page = 1; loadQueue(); });',
    '    els.clearToken.addEventListener("click", () => { localStorage.removeItem(storageKey); els.token.value = ""; setStatus("Saved auth cleared."); });',
    '    els.previousPage.addEventListener("click", () => { if (state.filters.page > 1) { state.filters.page -= 1; loadQueue(); } });',
    '    els.nextPage.addEventListener("click", () => { state.filters.page += 1; loadQueue(); });',
    '    els.assignedTo.addEventListener("keydown", (event) => { if (event.key === "Enter") { state.filters.page = 1; loadQueue(); } });',
    '    els.search.addEventListener("keydown", (event) => { if (event.key === "Enter") { state.filters.page = 1; loadQueue(); } });',
    '    els.sort.addEventListener("change", () => { state.filters.page = 1; loadQueue(); });',
    '    els.approve.addEventListener("click", () => submitReview("approved"));',
    '    els.reject.addEventListener("click", () => submitReview("rejected"));',
    '    els.assignSelected.addEventListener("click", () => submitBulkAction("assign"));',
    '    els.approveSelected.addEventListener("click", () => submitBulkAction("approve"));',
    '    els.rejectSelected.addEventListener("click", () => submitBulkAction("reject"));',
    '    els.clearSelection.addEventListener("click", clearSelection);',
    '    renderSummary();',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}

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
      '      <a class="card" href="/learn/onboarding">',
      '        <span class="title">Onboarding Console</span>',
      '        <span class="hint">Create install links, reconcile manual GitHub App installs, and mint widget sessions.</span>',
      '      </a>',
      '      <a class="card" href="/learn/review-queue">',
      '        <span class="title">Operator Review Console</span>',
      '        <span class="hint">Review hosted feedback, inspect context, and approve or reject GitHub issue creation.</span>',
      '      </a>',
      '      <a class="card" href="/learn/support-ops">',
      '        <span class="title">Support Operations Console</span>',
      '        <span class="hint">Resolve projects by key, inspect support readiness, and jump directly into widget or queue follow-up.</span>',
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