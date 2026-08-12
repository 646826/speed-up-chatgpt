/* Speed Up ChatGPT — popup logic.
 *
 * Contracts:
 * - Settings live in chrome.storage.local under "suc_settings":
 *   { enabled, messageLimit, batchSize, quietMode }.
 * - Talks to the content script (page-ui.js) of the active tab:
 *   {type:"suc:getStats"}                         -> {enabled, messageLimit, batchSize, quietMode,
 *                                                    visible, hidden, total, hasConversation}
 *   {type:"suc:export", format:"md|txt|json|pdf"} -> {ok, error?}
 *   {type:"suc:reloadTab"}                         -> tab reloads
 */
(function () {
  "use strict";

  var DEFAULT_SETTINGS = {
    enabled: true,
    messageLimit: 15,
    batchSize: 10,
    quietMode: false
  };

  var LIMIT_MIN = 5;
  var LIMIT_MAX = 200;
  var BATCH_MIN = 5;
  var BATCH_MAX = 50;

  // Current settings snapshot kept in sync with chrome.storage.local.
  var settings = Object.assign({}, DEFAULT_SETTINGS);
  var activeTabId = null;

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function collectElements() {
    els.stateBadge = $("stateBadge");
    els.enabledToggle = $("enabledToggle");
    els.messageLimit = $("messageLimit");
    els.batchSize = $("batchSize");
    els.quietMode = $("quietMode");
    els.reloadHint = $("reloadHint");
    els.statVisible = $("statVisible");
    els.statHidden = $("statHidden");
    els.statTotal = $("statTotal");
    els.statsValues = $("statsValues");
    els.noConversation = $("noConversation");
    els.exportButtons = Array.prototype.slice.call(document.querySelectorAll(".btn-export"));
    els.exportError = $("exportError");
    els.reloadTab = $("reloadTab");
    els.mainContent = $("mainContent");
    els.notChatgpt = $("notChatgpt");
  }

  function clamp(value, min, max) {
    var n = parseInt(value, 10);
    if (isNaN(n)) {
      n = min;
    }
    return Math.min(max, Math.max(min, n));
  }

  /* ---------- rendering ---------- */

  function renderSettings() {
    els.enabledToggle.setAttribute("aria-checked", settings.enabled ? "true" : "false");
    els.stateBadge.textContent = settings.enabled ? "ON" : "OFF";
    els.stateBadge.classList.toggle("badge-on", settings.enabled);
    els.stateBadge.classList.toggle("badge-off", !settings.enabled);

    els.messageLimit.value = settings.messageLimit;
    els.batchSize.value = settings.batchSize;
    els.quietMode.checked = settings.quietMode;
  }

  function renderStats(stats) {
    if (stats && stats.hasConversation) {
      els.statVisible.textContent = String(stats.visible);
      els.statHidden.textContent = String(stats.hidden);
      els.statTotal.textContent = String(stats.total);
      els.statsValues.classList.remove("hidden");
      els.noConversation.classList.add("hidden");
    } else {
      els.statVisible.textContent = "–";
      els.statHidden.textContent = "–";
      els.statTotal.textContent = "–";
      els.statsValues.classList.add("hidden");
      els.noConversation.classList.remove("hidden");
    }

    var canExport = !!(stats && stats.hasConversation);
    els.exportButtons.forEach(function (btn) {
      btn.disabled = !canExport;
    });
  }

  function showReloadHint() {
    els.reloadHint.classList.remove("hidden");
  }

  function showExportError(message) {
    els.exportError.textContent = message;
    els.exportError.classList.remove("hidden");
  }

  function clearExportError() {
    els.exportError.textContent = "";
    els.exportError.classList.add("hidden");
  }

  /* ---------- settings persistence ---------- */

  function saveSettings() {
    settings.messageLimit = clamp(settings.messageLimit, LIMIT_MIN, LIMIT_MAX);
    settings.batchSize = clamp(settings.batchSize, BATCH_MIN, BATCH_MAX);
    chrome.storage.local.set({ suc_settings: settings });
    renderSettings();
    // enabled/messageLimit take full effect after the tab refetches the
    // conversation — suggest a reload (config-bridge propagates instantly,
    // but already-rendered messages stay trimmed until reload).
    showReloadHint();
  }

  /* ---------- messaging helpers ---------- */

  function sendToActiveTab(message) {
    return new Promise(function (resolve, reject) {
      if (activeTabId == null) {
        reject(new Error("no active tab"));
        return;
      }
      chrome.tabs.sendMessage(activeTabId, message, function (response) {
        var err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /* ---------- event handlers ---------- */

  function onToggleEnabled() {
    settings.enabled = !settings.enabled;
    saveSettings();
  }

  function onStep(input, min, max, delta) {
    input.value = clamp(parseInt(input.value, 10) + delta, min, max);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function bindEvents() {
    els.enabledToggle.addEventListener("click", onToggleEnabled);

    els.messageLimit.addEventListener("change", function () {
      settings.messageLimit = clamp(els.messageLimit.value, LIMIT_MIN, LIMIT_MAX);
      saveSettings();
    });
    els.batchSize.addEventListener("change", function () {
      settings.batchSize = clamp(els.batchSize.value, BATCH_MIN, BATCH_MAX);
      saveSettings();
    });

    $("limitMinus").addEventListener("click", function () {
      onStep(els.messageLimit, LIMIT_MIN, LIMIT_MAX, -1);
    });
    $("limitPlus").addEventListener("click", function () {
      onStep(els.messageLimit, LIMIT_MIN, LIMIT_MAX, 1);
    });
    $("batchMinus").addEventListener("click", function () {
      onStep(els.batchSize, BATCH_MIN, BATCH_MAX, -1);
    });
    $("batchPlus").addEventListener("click", function () {
      onStep(els.batchSize, BATCH_MIN, BATCH_MAX, 1);
    });

    els.quietMode.addEventListener("change", function () {
      settings.quietMode = els.quietMode.checked;
      saveSettings();
    });

    els.exportButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var format = btn.getAttribute("data-format");
        clearExportError();
        btn.disabled = true;
        sendToActiveTab({ type: "suc:export", format: format })
          .then(function (response) {
            if (!response || response.ok !== true) {
              showExportError("Export failed: " + ((response && response.error) || "no conversation"));
            }
          })
          .catch(function () {
            showExportError("Export failed: cannot reach the page. Reload the tab.");
          })
          .finally(function () {
            btn.disabled = false;
          });
      });
    });

    els.reloadTab.addEventListener("click", function () {
      sendToActiveTab({ type: "suc:reloadTab" }).catch(function () {
        // Tab may not have the content script; reload directly as fallback.
        if (activeTabId != null) {
          chrome.tabs.reload(activeTabId);
        }
      });
      els.reloadHint.classList.add("hidden");
    });
  }

  /* ---------- init ---------- */

  function showNotChatgpt() {
    els.mainContent.classList.add("hidden");
    els.notChatgpt.classList.remove("hidden");
  }

  function init() {
    collectElements();
    bindEvents();
    renderSettings();
    renderStats(null);

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || tab.id == null) {
        showNotChatgpt();
        return;
      }
      activeTabId = tab.id;

      // Load persisted settings (defaults merge; background sets them on
      // install, but stay defensive here).
      chrome.storage.local.get("suc_settings", function (data) {
        var stored = (data && data.suc_settings) || {};
        settings = Object.assign({}, DEFAULT_SETTINGS, stored);
        renderSettings();
      });

      // Ask the content script for live stats. Fails on non-ChatGPT tabs
      // (no receiver) — handled via try/catch + lastError.
      try {
        sendToActiveTab({ type: "suc:getStats" })
          .then(function (stats) {
            if (stats) {
              settings = Object.assign({}, DEFAULT_SETTINGS, {
                enabled: stats.enabled,
                messageLimit: stats.messageLimit,
                batchSize: stats.batchSize,
                quietMode: stats.quietMode
              });
              renderSettings();
              renderStats(stats);
            } else {
              showNotChatgpt();
            }
          })
          .catch(function () {
            showNotChatgpt();
          });
      } catch (e) {
        showNotChatgpt();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
