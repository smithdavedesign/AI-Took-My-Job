interface NexusConfig {
  nexusUrl: string;
  sharedSecret: string;
  projectId: string;
  reporterId: string;
  reporterRole: string;
}

const notConfiguredEl = document.getElementById('notConfigured') as HTMLDivElement;
const reportFormEl = document.getElementById('reportForm') as HTMLDivElement;
const statusBar = document.getElementById('statusBar') as HTMLDivElement;
const pageUrlEl = document.getElementById('pageUrl') as HTMLDivElement;
const projectLabelEl = document.getElementById('projectLabel') as HTMLDivElement;
const titleInput = document.getElementById('title') as HTMLInputElement;
const severitySelect = document.getElementById('severity') as HTMLSelectElement;
const environmentSelect = document.getElementById('environment') as HTMLSelectElement;
const notesInput = document.getElementById('notes') as HTMLTextAreaElement;
const submitBtn = document.getElementById('submitBtn') as HTMLButtonElement;

let currentTabUrl = '';
let currentTabTitle = '';
let config: NexusConfig | null = null;

document.getElementById('openOptions')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('settingsBtn')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Load config and current tab in parallel
Promise.all([
  new Promise<NexusConfig | null>((resolve) => {
    chrome.storage.sync.get(
      ['nexusUrl', 'sharedSecret', 'projectId', 'reporterId', 'reporterRole'],
      (items) => {
        const c = items as Partial<NexusConfig>;
        if (c.nexusUrl && c.sharedSecret && c.projectId && c.reporterId) {
          resolve(c as NexusConfig);
        } else {
          resolve(null);
        }
      }
    );
  }),
  new Promise<chrome.tabs.Tab | null>((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] ?? null);
    });
  }),
]).then(([cfg, tab]) => {
  if (!cfg) {
    notConfiguredEl.style.display = 'block';
    return;
  }

  config = cfg;
  currentTabUrl = tab?.url ?? '';
  currentTabTitle = tab?.title ?? '';

  pageUrlEl.textContent = currentTabUrl || '(unknown)';
  pageUrlEl.title = currentTabUrl;
  projectLabelEl.textContent = `Project: ${cfg.projectId.slice(0, 8)}…`;
  titleInput.value = '';
  titleInput.placeholder = currentTabTitle ? `Bug on: ${currentTabTitle}` : 'Briefly describe the bug…';

  // Auto-detect environment from URL
  if (currentTabUrl.includes('localhost') || currentTabUrl.includes('127.0.0.1')) {
    environmentSelect.value = 'local';
  } else if (currentTabUrl.includes('staging') || currentTabUrl.includes('stage')) {
    environmentSelect.value = 'staging';
  } else if (currentTabUrl.includes('dev.') || currentTabUrl.includes('.dev')) {
    environmentSelect.value = 'development';
  } else if (!currentTabUrl.startsWith('http://')) {
    environmentSelect.value = 'production';
  }

  reportFormEl.style.display = 'block';
  titleInput.focus();
});

submitBtn.addEventListener('click', async () => {
  if (!config) return;

  const title = titleInput.value.trim() || currentTabTitle || 'Bug report';
  const severity = severitySelect.value as 'low' | 'medium' | 'high' | 'critical';
  const environment = environmentSelect.value as 'local' | 'development' | 'staging' | 'production';
  const notes = notesInput.value.trim() || undefined;

  if (!title) {
    titleInput.focus();
    return;
  }

  submitBtn.disabled = true;
  showStatus('Sending…', 'sending');

  const sessionId = crypto.randomUUID();

  const payload = {
    sessionId,
    projectId: config.projectId,
    title,
    pageUrl: currentTabUrl,
    environment,
    reporter: {
      id: config.reporterId,
      role: config.reporterRole || 'developer',
    },
    severity,
    signals: {
      consoleErrorCount: 0,
      networkErrorCount: 0,
      stakeholderCount: 1,
    },
    artifacts: {
      hasHar: false,
      hasScreenRecording: false,
      uploads: {},
    },
    ...(notes ? { notes } : {}),
  };

  try {
    const response = await fetch(`${config.nexusUrl}/webhooks/extension/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-shared-secret': config.sharedSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${response.status}: ${body || response.statusText}`);
    }

    showStatus('Report sent! ✓', 'success');
    setTimeout(() => window.close(), 1500);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showStatus(`Failed: ${message}`, 'error');
    submitBtn.disabled = false;
  }
});

function showStatus(message: string, type: 'success' | 'error' | 'sending'): void {
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
  statusBar.style.display = 'flex';
}
