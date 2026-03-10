export function buildOnboardingConsolePage(): string {
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
    .guardrail-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .guardrail-card { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,0.78); }
    .guardrail-card strong { display: block; font-size: 0.95rem; }
    .guardrail-card span { display: block; margin-top: 8px; color: var(--muted); font-size: 0.84rem; line-height: 1.45; }
    .guardrail-pass { border-color: rgba(13,105,91,0.28); background: rgba(13,105,91,0.08); }
    .guardrail-pass strong { color: var(--accent); }
    .guardrail-fail { border-color: rgba(139,98,8,0.26); background: rgba(139,98,8,0.09); }
    .guardrail-fail strong { color: var(--warning); }
    .guardrail-neutral { border-color: var(--line); }
    .wizard-step-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .wizard-step { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,0.78); }
    .wizard-step strong { display: block; font-size: 0.95rem; }
    .wizard-step span { display: block; margin-top: 8px; color: var(--muted); font-size: 0.84rem; line-height: 1.45; }
    .wizard-complete { border-color: rgba(13,105,91,0.28); background: rgba(13,105,91,0.08); }
    .wizard-complete strong { color: var(--accent); }
    .wizard-ready { border-color: rgba(13,105,91,0.2); background: rgba(13,105,91,0.05); }
    .wizard-ready strong { color: var(--ink); }
    .wizard-attention { border-color: rgba(139,98,8,0.26); background: rgba(139,98,8,0.09); }
    .wizard-attention strong { color: var(--warning); }
    .wizard-blocked { border-color: rgba(146,47,47,0.2); background: rgba(146,47,47,0.08); }
    .wizard-blocked strong { color: #922f2f; }
    @media (max-width: 1120px) { .shell, .split, .summary-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow">Pilot • Connect • Launch</span>
      <h1>Pilot a project, connect the repo, and launch customer intake from one surface.</h1>
      <p>This console is the front half of the five-step Nexus story: pilot the workspace and project, connect GitHub and repo scope, and launch customer intake with the widget, portal, and support-readiness checks before the team moves into daily operations and promotion.</p>
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
          <div class="split">
            <label>Customer Email<input id="customerPortalEmail" value="" placeholder="customer@example.com" /></label>
            <label>Customer Name<input id="customerPortalName" value="" placeholder="Checkout Team" /></label>
          </div>
          <div class="split">
            <label>Grant TTL Days<input id="customerPortalTtlDays" value="30" placeholder="30" /></label>
            <label>Portal Grant Id<input id="customerPortalGrantId" value="" placeholder="customer portal grant UUID" /></label>
          </div>
          <label>Customer Portal Notes<textarea id="customerPortalNotes" placeholder="Why this durable portal access link exists."></textarea></label>
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
          <div class="section">
            <h2 class="section-title">GitHub Setup Wizard</h2>
            <div id="wizardInlineSummary" class="helper">No GitHub setup status loaded yet.</div>
            <div class="row">
              <button id="loadGitHubSetup" class="secondary">Check GitHub Setup</button>
              <button id="runGitHubWizard" class="primary">Run Next GitHub Step</button>
            </div>
          </div>
          <div class="row">
            <button id="transferInstall" class="primary">Transfer Install</button>
            <button id="mintWidget" class="secondary">Mint Widget Session</button>
          </div>
          <div class="row">
            <button id="loadCustomerPortalGrants" class="secondary">Load Portal Grants</button>
            <button id="createCustomerPortalGrant" class="primary">Create Portal Grant</button>
            <button id="revokeCustomerPortalGrant" class="secondary">Revoke Portal Grant</button>
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
          <article class="card"><span class="helper">Connect</span><strong id="installationCount">0</strong><span class="helper">GitHub App installs mapped to this workspace.</span></article>
          <article class="card"><span class="helper">Pilot</span><strong id="projectCount">0</strong><span class="helper">Projects currently loaded for the workspace.</span></article>
          <article class="card"><span class="helper">Launch</span><strong id="connectionCount">0</strong><span class="helper">Repo connections loaded for the selected project.</span></article>
          <article class="card"><span class="helper">Promote Readiness</span><strong id="readinessValue">unknown</strong><span id="readinessNote" class="helper">Load a support snapshot to score project readiness.</span></article>
        </div>
        <div class="section">
          <h2 class="section-title">Readiness And Promotion Guardrails</h2>
          <div class="guardrail-grid">
            <article id="guardrailBoundary" class="guardrail-card guardrail-neutral"><strong>Project boundary unresolved</strong><span>Load a workspace, project, and repo connection before rollout moves forward.</span></article>
            <article id="guardrailReadiness" class="guardrail-card guardrail-neutral"><strong>Launch readiness unknown</strong><span>Support readiness has not been loaded yet.</span></article>
            <article id="guardrailReviewGate" class="guardrail-card guardrail-neutral"><strong>Review gate unknown</strong><span>Pending review work has not been loaded yet.</span></article>
            <article id="guardrailPromotionScope" class="guardrail-card guardrail-neutral"><strong>Promotion scope unresolved</strong><span>Confirm a default repo and explicit customer-access scope before promoting work or durable access.</span></article>
          </div>
        </div>
        <div class="section">
          <h2 class="section-title">Pilot Snapshot</h2>
          <div id="bindings" class="pill-list"></div>
          <div id="bindingNotes" class="helper">Load a workspace and project to inspect their current install and repository bindings.</div>
        </div>
        <div class="section">
          <h2 class="section-title">Connect Repositories</h2>
          <div id="repoConnectionList" class="button-list"></div>
          <div id="repoConnectionSummary" class="helper">Select a repo connection to preload the editor, or create one from the controls panel.</div>
          <pre id="repoConnectionResult">// repo-connection responses appear here</pre>
        </div>
        <div class="result">
          <section class="section">
            <h2 class="section-title">Launch Readiness</h2>
            <div id="supportSummary" class="helper">No support snapshot loaded yet.</div>
            <pre id="supportResult">// support readiness appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Operate Snapshot</h2>
            <div id="operationsSummary" class="helper">No project operations loaded yet.</div>
            <pre id="operationsResult">// project operations summary appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Operate Policy</h2>
            <div id="triagePolicySummary" class="helper">No triage policy loaded yet.</div>
            <pre id="triagePolicyResult">// workspace triage policy appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Promote Customer Access</h2>
            <div id="customerPortalGrantSummary" class="helper">No customer portal grant action run yet.</div>
            <div id="customerPortalGrantList" class="button-list"></div>
            <pre id="customerPortalGrantResult">// customer portal grant responses appear here</pre>
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
            <h2 class="section-title">GitHub Setup Wizard</h2>
            <div id="wizardSummary" class="helper">Check GitHub setup to see the next blocking step for project-scoped GitHub promotion.</div>
            <div id="wizardSteps" class="wizard-step-grid"></div>
            <pre id="wizardResult">// github setup status appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Transfer</h2>
            <div id="transferSummary" class="helper">No installation transfer run yet.</div>
            <pre id="transferResult">// transfer response appears here</pre>
          </section>
          <section class="section">
            <h2 class="section-title">Launch Widget Handoff</h2>
            <div id="widgetSummary" class="helper">No widget session minted yet.</div>
            <pre id="widgetResult">// widget-session response appears here</pre>
          </section>
        </div>
      </section>
    </section>
  </main>
  <script>
    const storageKey = 'nexus-onboarding-console';
    const contextState = { projects: [], installations: [], repoConnections: [], customerPortalGrants: [] };
    const guardrailState = { projectCount: 0, repoConnectionCount: 0, hasDefaultRepo: false, readiness: 'unknown', pendingReviewCount: null, activeGrantCount: 0 };
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
      customerPortalEmail: document.getElementById('customerPortalEmail'),
      customerPortalName: document.getElementById('customerPortalName'),
      customerPortalTtlDays: document.getElementById('customerPortalTtlDays'),
      customerPortalGrantId: document.getElementById('customerPortalGrantId'),
      customerPortalNotes: document.getElementById('customerPortalNotes'),
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
      loadCustomerPortalGrants: document.getElementById('loadCustomerPortalGrants'),
      createCustomerPortalGrant: document.getElementById('createCustomerPortalGrant'),
      revokeCustomerPortalGrant: document.getElementById('revokeCustomerPortalGrant'),
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
      customerPortalGrantSummary: document.getElementById('customerPortalGrantSummary'),
      customerPortalGrantList: document.getElementById('customerPortalGrantList'),
      customerPortalGrantResult: document.getElementById('customerPortalGrantResult'),
      serviceIdentitySummary: document.getElementById('serviceIdentitySummary'),
      serviceIdentityResult: document.getElementById('serviceIdentityResult'),
      installLinkSummary: document.getElementById('installLinkSummary'),
      installLinkResult: document.getElementById('installLinkResult'),
      lookupSummary: document.getElementById('lookupSummary'),
      lookupResult: document.getElementById('lookupResult'),
      reconcileSummary: document.getElementById('reconcileSummary'),
      reconcileResult: document.getElementById('reconcileResult'),
      wizardInlineSummary: document.getElementById('wizardInlineSummary'),
      loadGitHubSetup: document.getElementById('loadGitHubSetup'),
      runGitHubWizard: document.getElementById('runGitHubWizard'),
      wizardSummary: document.getElementById('wizardSummary'),
      wizardSteps: document.getElementById('wizardSteps'),
      wizardResult: document.getElementById('wizardResult'),
      transferSummary: document.getElementById('transferSummary'),
      transferResult: document.getElementById('transferResult'),
      widgetSummary: document.getElementById('widgetSummary'),
      widgetResult: document.getElementById('widgetResult'),
      guardrailBoundary: document.getElementById('guardrailBoundary'),
      guardrailReadiness: document.getElementById('guardrailReadiness'),
      guardrailReviewGate: document.getElementById('guardrailReviewGate'),
      guardrailPromotionScope: document.getElementById('guardrailPromotionScope')
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
        customerPortalEmail: els.customerPortalEmail.value.trim(),
        customerPortalName: els.customerPortalName.value.trim(),
        customerPortalTtlDays: els.customerPortalTtlDays.value.trim(),
        customerPortalGrantId: els.customerPortalGrantId.value.trim(),
        customerPortalNotes: els.customerPortalNotes.value,
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
    function describeWizardNextAction(nextAction) {
      switch (nextAction) {
        case 'enable-draft-sync': return 'Enable GITHUB_DRAFT_SYNC_ENABLED so GitHub promotion is allowed.';
        case 'switch-to-app-auth': return 'Switch to GitHub App auth so project-scoped repo bindings use installation-backed credentials.';
        case 'set-app-id': return 'Set GITHUB_APP_ID in the app environment.';
        case 'set-private-key': return 'Set GITHUB_APP_PRIVATE_KEY in the app environment.';
        case 'set-app-slug': return 'Set GITHUB_APP_SLUG so Nexus can generate the GitHub install link.';
        case 'select-workspace': return 'Choose the workspace you want to wire to GitHub.';
        case 'select-project': return 'Choose the project whose repository promotion should be enabled.';
        case 'select-repository': return 'Choose the owner/repo to link into the selected project.';
        case 'create-install-link': return 'Generate the GitHub install link and complete installation in GitHub.';
        case 'select-installation': return 'Select which existing workspace installation should back this project.';
        case 'transfer-installation': return 'Transfer the selected installation into this workspace before linking the repository.';
        case 'grant-repository-access': return 'Update the GitHub App installation so it can see the selected repository.';
        case 'reconcile-installation': return 'Persist the installation and create or refresh the default repo connection for this project.';
        case 'verify-app-permissions': return 'GitHub App credentials are present, but Nexus could not inspect the installation repositories.';
        case 'verify-project-scope': return 'The installation and connection exist, but project-scoped GitHub promotion is still not enabled.';
        case 'ready': return 'GitHub setup is complete for this project and repository.';
        default: return 'Check GitHub setup to see the next step.';
      }
    }
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
    function setReadiness(value, note) {
      els.readinessValue.textContent = value || 'unknown';
      els.readinessNote.textContent = note || 'Load a support snapshot to score project readiness.';
    }
    function renderGuardrailCard(target, tone, title, detail) {
      target.className = 'guardrail-card guardrail-' + tone;
      target.innerHTML = '<strong>' + title + '</strong><span>' + detail + '</span>';
    }
    function renderPromotionGuardrails() {
      const boundaryReady = guardrailState.projectCount > 0 && guardrailState.repoConnectionCount > 0;
      renderGuardrailCard(els.guardrailBoundary, boundaryReady ? 'pass' : 'fail', boundaryReady ? 'Project boundary resolved' : 'Project boundary still open', boundaryReady ? 'Project and repo scope are loaded, so rollout decisions now have a concrete target.' : 'Load a project and at least one repo connection before launch or promotion decisions.');
      const readinessReady = guardrailState.readiness === 'ready';
      renderGuardrailCard(els.guardrailReadiness, readinessReady ? 'pass' : 'fail', readinessReady ? 'Launch readiness is green' : 'Launch readiness is not green', readinessReady ? 'Support readiness reports the project is ready for customer handoff.' : 'Do not broaden rollout while support readiness is blocked or unknown.');
      const pendingReviewCount = typeof guardrailState.pendingReviewCount === 'number' ? guardrailState.pendingReviewCount : null;
      const reviewGateReady = pendingReviewCount === 0;
      renderGuardrailCard(els.guardrailReviewGate, reviewGateReady ? 'pass' : pendingReviewCount === null ? 'neutral' : 'fail', reviewGateReady ? 'Review gate is clear' : pendingReviewCount === null ? 'Review gate not loaded' : 'Review gate still has pending work', reviewGateReady ? 'No hosted-feedback backlog is currently blocking promotion decisions.' : pendingReviewCount === null ? 'Load project operations to inspect pending review work.' : String(pendingReviewCount) + ' hosted-feedback item(s) still need review before promotion should move forward.');
      const promotionScoped = guardrailState.hasDefaultRepo && guardrailState.readiness === 'ready';
      const grantNote = guardrailState.activeGrantCount > 0 ? ' Durable customer access is already constrained to ' + guardrailState.activeGrantCount + ' active grant(s).' : ' No durable customer grant is live yet.';
      renderGuardrailCard(els.guardrailPromotionScope, promotionScoped ? 'pass' : 'fail', promotionScoped ? 'Promotion scope is explicit' : 'Promotion scope is still ambiguous', promotionScoped ? 'A default repo is resolved and readiness is green.' + grantNote : 'Resolve the default repo and readiness state before promoting work or customer access.' + grantNote);
    }
    function selectCustomerPortalGrant(grant) {
      els.customerPortalGrantId.value = grant.id || '';
      els.customerPortalEmail.value = grant.customerEmail || '';
      els.customerPortalName.value = grant.customerName || '';
      els.customerPortalGrantSummary.textContent = 'Loaded durable customer portal grant for ' + (grant.customerEmail || 'unknown customer') + '.';
    }
    function renderCustomerPortalGrants(result) {
      const grants = Array.isArray(result && result.grants) ? result.grants : Array.isArray(result) ? result : [];
      contextState.customerPortalGrants = grants;
      els.customerPortalGrantList.innerHTML = '';
      writeJson(els.customerPortalGrantResult, result);
      grants.forEach(function (grant) {
        const button = document.createElement('button');
        button.className = 'secondary mini';
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
    function renderGitHubSetup(result) {
      writeJson(els.wizardResult, result);
      els.wizardSteps.innerHTML = '';
      const steps = result && result.wizard && Array.isArray(result.wizard.steps) ? result.wizard.steps : [];
      steps.forEach(function (step) {
        const card = document.createElement('article');
        card.className = 'wizard-step wizard-' + (step.status || 'blocked');
        card.innerHTML = '<strong>' + step.label + '</strong><span>' + (step.detail || '') + '</span>';
        els.wizardSteps.appendChild(card);
      });
      const nextAction = result && result.wizard ? result.wizard.nextAction : null;
      const summary = describeWizardNextAction(nextAction);
      els.wizardSummary.textContent = summary;
      els.wizardInlineSummary.textContent = summary;
      if (result && result.installation && result.installation.selected) {
        if (result.installation.selected.installationId) {
          els.installationId.value = String(result.installation.selected.installationId);
        }
        if (result.installation.selected.id) {
          els.githubInstallationRecordId.value = result.installation.selected.id;
        }
      }
      if (result && result.repository && result.repository.selected) {
        els.repository.value = result.repository.selected;
      }
    }
    function buildGitHubSetupQuery() {
      const params = new URLSearchParams();
      const workspaceId = els.workspaceId.value.trim();
      const projectId = els.projectId.value.trim();
      const repository = els.repository.value.trim();
      const installationId = els.installationId.value.trim();
      if (workspaceId) {
        params.set('workspaceId', workspaceId);
      }
      if (projectId) {
        params.set('projectId', projectId);
      }
      if (repository) {
        params.set('repository', repository);
      }
      if (installationId) {
        params.set('installationId', installationId);
      }
      return params;
    }
    async function loadGitHubSetupStatus(options) {
      const silent = Boolean(options && options.silent);
      saveState();
      const query = buildGitHubSetupQuery();
      if (!query.get('workspaceId') && !query.get('projectId')) {
        if (!silent) {
          setStatus('Workspace Id or Project Id is required to check GitHub setup.');
        }
        return null;
      }
      if (!silent) {
        setStatus('Checking GitHub setup...');
      }
      try {
        const result = await request('/internal/github-app/setup-status?' + query.toString(), { headers: authHeaders() });
        renderGitHubSetup(result);
        if (!silent) {
          setStatus('GitHub setup loaded. ' + describeWizardNextAction(result && result.wizard ? result.wizard.nextAction : null));
        }
        return result;
      } catch (error) {
        if (!silent) {
          setStatus(error instanceof Error ? error.message : 'Failed to load GitHub setup status.');
        }
        return null;
      }
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
      renderPromotionGuardrails();
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
      guardrailState.projectCount = contextState.projects.length;
      guardrailState.repoConnectionCount = contextState.repoConnections.length;
      guardrailState.hasDefaultRepo = contextState.repoConnections.some(function (connection) { return Boolean(connection && connection.isDefault); });
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
      renderPromotionGuardrails();
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
        await loadGitHubSetupStatus({ silent: true });
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
        const customerPortal = result.customerPortal || {};
        els.operationsSummary.textContent = 'Default repo ' + defaultRepository + '. Pending review ' + pendingReviewCount + '. Agent tasks ' + taskCount + '. Policy rules ' + ((triagePolicySummary.ownershipRuleCount || 0) + (triagePolicySummary.priorityRuleCount || 0)) + '. Durable grants ' + (customerPortal.activeGrantCount || 0) + '.';
        const support = result.support || {};
        const issues = Array.isArray(support.issues) ? support.issues : [];
        const feedbackCount = Array.isArray(support.recentHostedFeedback) ? support.recentHostedFeedback.length : 0;
        const grantCount = typeof support.customerPortalGrantCount === 'number' ? support.customerPortalGrantCount : (customerPortal.activeGrantCount || 0);
        guardrailState.readiness = support.readiness || 'unknown';
        guardrailState.pendingReviewCount = pendingReviewCount;
        guardrailState.hasDefaultRepo = defaultRepository !== 'none' || guardrailState.hasDefaultRepo;
        guardrailState.activeGrantCount = grantCount;
        const policyNote = support.triagePolicySummary && support.triagePolicySummary.configured
          ? ' Policy configured with ' + ((support.triagePolicySummary.ownershipRuleCount || 0) + (support.triagePolicySummary.priorityRuleCount || 0)) + ' rules.'
          : ' No triage policy configured.';
        els.supportSummary.textContent = 'Readiness ' + (support.readiness || 'unknown') + '. Recent hosted feedback ' + feedbackCount + '. Active durable grants ' + grantCount + '. ' + (issues[0] || 'No open support blockers.') + policyNote;
        if (result.triagePolicy) {
          renderTriagePolicy({ workspace: result.workspace, policy: result.triagePolicy.policy || null, summary: result.triagePolicy });
        }
        if (result.customerPortal) {
          renderCustomerPortalGrants({ project: result.project, grants: result.customerPortal.grants || [] });
        }
        setReadiness(support.readiness || 'unknown', issues.length ? issues.join(' ') : 'Project is ready for customer handoff.');
        renderPromotionGuardrails();
        await loadGitHubSetupStatus({ silent: true });
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
        await loadGitHubSetupStatus({ silent: true });
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
        await loadGitHubSetupStatus({ silent: true });
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
        els.wizardInlineSummary.textContent = 'Install link ready. Complete the GitHub install flow, then return and run the wizard again.';
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
        await loadGitHubSetupStatus({ silent: true });
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
        await loadGitHubSetupStatus({ silent: true });
        setStatus('Installation ' + installationId + ' transferred.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to transfer install.');
      }
    }
    async function runGitHubWizard() {
      const statusResult = await loadGitHubSetupStatus({ silent: false });
      if (!statusResult || !statusResult.wizard) {
        return;
      }
      const nextAction = statusResult.wizard.nextAction;
      const suggested = statusResult.wizard.suggestedPayload || {};
      if (suggested.workspaceId && !els.workspaceId.value.trim()) {
        els.workspaceId.value = suggested.workspaceId;
      }
      if (suggested.projectId && !els.projectId.value.trim()) {
        els.projectId.value = suggested.projectId;
      }
      if (suggested.repository && !els.repository.value.trim()) {
        els.repository.value = suggested.repository;
      }
      if (suggested.installationId) {
        els.installationId.value = String(suggested.installationId);
      }
      if (suggested.githubInstallationRecordId) {
        els.githubInstallationRecordId.value = suggested.githubInstallationRecordId;
      }

      if (nextAction === 'create-install-link') {
        await createInstallLink();
        return;
      }

      if (nextAction === 'reconcile-installation') {
        await reconcileInstall();
        return;
      }

      if (nextAction === 'transfer-installation') {
        await transferInstall();
        return;
      }

      if (nextAction === 'ready') {
        await loadOperations();
        setStatus('GitHub setup is already ready for this project.');
        return;
      }

      setStatus(describeWizardNextAction(nextAction));
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
    async function loadCustomerPortalGrants() {
      saveState();
      const projectId = els.projectId.value.trim();
      if (!projectId) {
        setStatus('Project Id is required to load customer portal grants.');
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
      const projectId = els.projectId.value.trim();
      const customerEmail = els.customerPortalEmail.value.trim();
      if (!projectId || !customerEmail) {
        setStatus('Project Id and Customer Email are required to create a customer portal grant.');
        return;
      }
      setStatus('Creating customer portal grant for ' + customerEmail + '...');
      try {
        const payload = {
          customerEmail: customerEmail,
          customerName: els.customerPortalName.value.trim() || undefined,
          ttlDays: parseCustomerPortalTtlDays(),
          notes: els.customerPortalNotes.value.trim() || undefined
        };
        const result = await request('/internal/projects/' + projectId + '/customer-portal-grants', {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, authHeaders()),
          body: JSON.stringify(payload)
        });
        writeJson(els.customerPortalGrantResult, result);
        if (result && result.grant) {
          selectCustomerPortalGrant(result.grant);
        }
        els.customerPortalGrantSummary.textContent = result && result.customerPortalUrl
          ? 'Created durable portal grant. Share ' + result.customerPortalUrl
          : 'Created durable portal grant.';
        await loadCustomerPortalGrants();
        await loadOperations();
        setStatus('Customer portal grant created for ' + customerEmail + '.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to create customer portal grant.');
      }
    }
    async function revokeCustomerPortalGrant() {
      saveState();
      const projectId = els.projectId.value.trim();
      const grantId = els.customerPortalGrantId.value.trim();
      if (!projectId || !grantId) {
        setStatus('Project Id and Portal Grant Id are required to revoke a customer portal grant.');
        return;
      }
      setStatus('Revoking customer portal grant ' + grantId + '...');
      try {
        const result = await request('/internal/projects/' + projectId + '/customer-portal-grants/' + encodeURIComponent(grantId) + '/revoke', {
          method: 'POST',
          headers: authHeaders()
        });
        writeJson(els.customerPortalGrantResult, result);
        if (result && result.grant) {
          selectCustomerPortalGrant(result.grant);
        }
        await loadCustomerPortalGrants();
        await loadOperations();
        setStatus('Customer portal grant ' + grantId + ' revoked.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to revoke customer portal grant.');
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
    els.customerPortalEmail.value = saved.customerPortalEmail || '';
    els.customerPortalName.value = saved.customerPortalName || '';
    els.customerPortalTtlDays.value = saved.customerPortalTtlDays || '30';
    els.customerPortalGrantId.value = saved.customerPortalGrantId || '';
    els.customerPortalNotes.value = saved.customerPortalNotes || '';
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
    els.loadGitHubSetup.addEventListener('click', function () { void loadGitHubSetupStatus(); });
    els.runGitHubWizard.addEventListener('click', function () { void runGitHubWizard(); });
    els.transferInstall.addEventListener('click', transferInstall);
    els.mintWidget.addEventListener('click', mintWidget);
    els.loadCustomerPortalGrants.addEventListener('click', loadCustomerPortalGrants);
    els.createCustomerPortalGrant.addEventListener('click', createCustomerPortalGrant);
    els.revokeCustomerPortalGrant.addEventListener('click', revokeCustomerPortalGrant);
    els.listServiceIdentities.addEventListener('click', listServiceIdentities);
    els.createServiceIdentity.addEventListener('click', createServiceIdentity);
    els.rotateServiceIdentity.addEventListener('click', rotateServiceIdentity);
    els.revokeServiceIdentity.addEventListener('click', revokeServiceIdentity);
    renderPromotionGuardrails();
    if (els.workspaceId.value || els.projectId.value) {
      void loadGitHubSetupStatus({ silent: true });
    }
  </script>
</body>
</html>`;
}
