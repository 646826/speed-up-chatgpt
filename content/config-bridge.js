// Speed Up ChatGPT — config bridge (isolated world, document_start)
// Bridges chrome.storage.local (extension settings) into the page context:
//  - writes the current settings to localStorage["suc_config"] so the
//    MAIN-world interceptor can read its initial config synchronously
//  - forwards later setting changes to MAIN world via a CustomEvent

"use strict";

(function () {
  const SUC_DEFAULT_SETTINGS = {
    enabled: true,
    messageLimit: 15,
    batchSize: 10,
    quietMode: false,
  };

  function withDefaults(settings) {
    return Object.assign({}, SUC_DEFAULT_SETTINGS, settings || {});
  }

  // Initial settings: merge stored values with defaults, then expose them
  // to the MAIN-world script before it patches window.fetch.
  chrome.storage.local.get("suc_settings", (data) => {
    const settings = withDefaults(data && data.suc_settings);
    try {
      localStorage.setItem("suc_config", JSON.stringify(settings));
    } catch (err) {
      // localStorage may be unavailable (e.g. blocked storage); the
      // interceptor falls back to defaults in that case.
    }
  });

  // Live updates: popup changes settings -> broadcast into the page.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes || !changes.suc_settings) return;
    const newSettings = withDefaults(changes.suc_settings.newValue);
    try {
      localStorage.setItem("suc_config", JSON.stringify(newSettings));
    } catch (err) {
      // Ignore storage failures; the CustomEvent still delivers the update.
    }
    window.dispatchEvent(
      new CustomEvent("suc:set-config", { detail: JSON.stringify(newSettings) })
    );
  });
})();
