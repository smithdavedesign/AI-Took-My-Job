// Minimal service worker — required by Manifest V3.
// Opens the options page on first install so users can configure the extension.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});
