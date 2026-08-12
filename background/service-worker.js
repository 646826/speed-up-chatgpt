// Speed Up ChatGPT — background service worker (MV3)
// Responsibilities:
//  - seed default settings on install/update (without overwriting existing ones)
//  - open the print/preview tab for PDF export

"use strict";

const SUC_DEFAULT_SETTINGS = {
  enabled: true,
  messageLimit: 15,
  batchSize: 10,
  quietMode: false,
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("suc_settings", (data) => {
    const existing = data && data.suc_settings ? data.suc_settings : {};
    // Merge: keep existing user values, fill in any missing defaults.
    const merged = Object.assign({}, SUC_DEFAULT_SETTINGS, existing);
    chrome.storage.local.set({ suc_settings: merged });
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "suc:openPreview" && typeof message.key === "string") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("preview/preview.html") + "?k=" + encodeURIComponent(message.key),
    });
  }
});
