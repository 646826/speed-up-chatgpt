// Speed Up ChatGPT — config bridge (isolated world, document_start)
// Cache settings for the next navigation and notify an interceptor that may
// already be running: chrome.storage callbacks are asynchronous.
"use strict";

(function () {
  const SUC_DEFAULT_SETTINGS = {
    enabled: true,
    messageLimit: 15,
    batchSize: 10,
    quietMode: false,
  };
  let changedSinceRead = false;

  function publish(settings) {
    const serialized = JSON.stringify(Object.assign({}, SUC_DEFAULT_SETTINGS, settings || {}));
    try {
      localStorage.setItem("suc_config", serialized);
    } catch (err) {
      // The live event still works when page storage is blocked.
    }
    window.dispatchEvent(new CustomEvent("suc:set-config", { detail: serialized }));
  }

  // Subscribe before reading so a delayed snapshot cannot roll back a newer
  // setting. Deleting the storage key also counts as a change (reset defaults).
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes || !changes.suc_settings) return;
    changedSinceRead = true;
    publish(changes.suc_settings.newValue);
  });

  try {
    chrome.storage.local.get("suc_settings", (data) => {
      // Always consume lastError, even when ignoring an obsolete snapshot.
      const error = chrome.runtime.lastError;
      if (error || changedSinceRead) return;
      publish(data && data.suc_settings);
    });
  } catch (err) {
    // An invalidated extension context must not break the page. The main-world
    // interceptor retains its previously cached settings or its defaults.
  }
})();
