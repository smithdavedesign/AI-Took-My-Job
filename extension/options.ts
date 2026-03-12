const fields = {
  nexusUrl: document.getElementById('nexusUrl') as HTMLInputElement,
  sharedSecret: document.getElementById('sharedSecret') as HTMLInputElement,
  projectId: document.getElementById('projectId') as HTMLInputElement,
  reporterId: document.getElementById('reporterId') as HTMLInputElement,
  reporterRole: document.getElementById('reporterRole') as HTMLSelectElement,
};

const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const statusMsg = document.getElementById('statusMsg') as HTMLSpanElement;

// Load saved settings on open
chrome.storage.sync.get(
  ['nexusUrl', 'sharedSecret', 'projectId', 'reporterId', 'reporterRole'],
  (items) => {
    if (items.nexusUrl) fields.nexusUrl.value = items.nexusUrl;
    if (items.sharedSecret) fields.sharedSecret.value = items.sharedSecret;
    if (items.projectId) fields.projectId.value = items.projectId;
    if (items.reporterId) fields.reporterId.value = items.reporterId;
    if (items.reporterRole) fields.reporterRole.value = items.reporterRole;
  }
);

saveBtn.addEventListener('click', () => {
  const nexusUrl = fields.nexusUrl.value.trim().replace(/\/$/, '');
  const sharedSecret = fields.sharedSecret.value.trim();
  const projectId = fields.projectId.value.trim();
  const reporterId = fields.reporterId.value.trim();
  const reporterRole = fields.reporterRole.value;

  if (!nexusUrl || !sharedSecret || !projectId || !reporterId) {
    showStatus('Please fill in all required fields.', 'error');
    return;
  }

  saveBtn.disabled = true;

  chrome.storage.sync.set(
    { nexusUrl, sharedSecret, projectId, reporterId, reporterRole },
    () => {
      saveBtn.disabled = false;
      showStatus('Settings saved.', 'success');
    }
  );
});

function showStatus(message: string, type: 'success' | 'error'): void {
  statusMsg.textContent = message;
  statusMsg.className = `status ${type}`;
  setTimeout(() => {
    statusMsg.textContent = '';
    statusMsg.className = 'status';
  }, 3000);
}
