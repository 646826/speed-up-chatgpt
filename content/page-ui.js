/* Speed Up ChatGPT — page UI (isolated world, document_idle).
 * Load-more button, toast, scroll restore, popup message handlers.
 * Shares window.__sucLastConversation with export/exporter.js.
 */
(function () {
  "use strict";

  var DEFAULTS = { enabled: true, messageLimit: 15, batchSize: 10, quietMode: false };

  var settings = Object.assign({}, DEFAULTS);
  var lastStats = null;
  var button = null;
  var toast = null;
  var toastTimer = null;
  var currentUrl = location.href;
  var loadMorePending = false;

  /* ---------------- settings ---------------- */

  function loadSettings(cb) {
    try {
      chrome.storage.local.get("suc_settings", function (res) {
        var error = chrome.runtime.lastError;
        if (!error) {
          settings = Object.assign({}, DEFAULTS, (res && res.suc_settings) || {});
        }
        if (cb) cb(settings, error);
      });
    } catch (e) {
      if (cb) cb(settings, e);
    }
  }

  /* ---------------- url / chat id ---------------- */

  function chatIdFrom(url) {
    var m;
    try {
      m = new URL(url, location.origin).pathname.match(/\/c\/([0-9a-fA-F-]{36})/);
    } catch (e) {
      m = null;
    }
    return m ? m[1].toLowerCase() : null;
  }

  function currentChatId() {
    return chatIdFrom(location.href);
  }

  /* ---------------- load more button ---------------- */

  function ensureButton() {
    if (button && button.isConnected) return button;
    button = document.createElement("button");
    button.type = "button";
    button.className = "suc-load-more suc-hidden";
    button.textContent = "Load " + settings.batchSize + " previous messages";
    button.addEventListener("click", onLoadMoreClick);
    (document.body || document.documentElement).appendChild(button);
    return button;
  }

  function updateButton() {
    if (!lastStats || !lastStats.hasOlderMessages) {
      if (button) button.classList.add("suc-hidden");
      return;
    }
    var btn = ensureButton();
    btn.textContent = "Load " + settings.batchSize + " previous messages";
    btn.classList.remove("suc-hidden");
  }

  function onLoadMoreClick() {
    if (loadMorePending) return;
    var chatId = currentChatId();
    if (!chatId) return;
    loadMorePending = true;
    if (button) button.disabled = true;

    function finish(error) {
      loadMorePending = false;
      if (button) {
        button.disabled = false;
        if (error && currentChatId() === chatId) {
          button.textContent = "Could not save settings. Click to retry.";
        }
      }
    }

    loadSettings(function (s, error) {
      if (error || currentChatId() !== chatId) {
        finish(error);
        return;
      }
      var next = Object.assign({}, s, { messageLimit: s.messageLimit + s.batchSize });
      try {
        chrome.storage.local.set({ suc_settings: next }, function () {
          var saveError = chrome.runtime.lastError;
          finish(saveError);
          // A failed save cannot reveal older messages. Nor should a late save
          // reload a different conversation opened while storage was pending.
          if (saveError || currentChatId() !== chatId) return;
          savePendingScroll();
          location.reload();
        });
      } catch (e) {
        finish(e);
      }
    });
  }

  function savePendingScroll() {
    try {
      var id = currentChatId();
      if (!id) return;
      var scroller = document.scrollingElement || document.documentElement;
      sessionStorage.setItem("suc_pending_scroll", id);
      sessionStorage.setItem("suc_pending_y", String(scroller.scrollTop || window.scrollY || 0));
    } catch (e) { /* sessionStorage unavailable */ }
  }

  /* ---------------- scroll restore after reload ---------------- */

  function restoreScrollIfPending() {
    var pendingId = null;
    var pendingY = null;
    try {
      pendingId = sessionStorage.getItem("suc_pending_scroll");
      pendingY = sessionStorage.getItem("suc_pending_y");
    } catch (e) {
      return;
    }
    if (!pendingId || pendingY === null) return;
    if (pendingId !== currentChatId()) return;

    var target = parseFloat(pendingY);
    if (!isFinite(target) || target < 0) target = 0;

    var startedAt = Date.now();
    var done = false;
    var observer = null;
    var retryTimer = null;

    function clearKeys() {
      try {
        sessionStorage.removeItem("suc_pending_scroll");
        sessionStorage.removeItem("suc_pending_y");
      } catch (e) { /* ignore */ }
    }

    function finish() {
      if (done) return;
      done = true;
      clearKeys();
      if (observer) observer.disconnect();
      if (retryTimer) clearInterval(retryTimer);
    }

    function attempt() {
      if (done) return true;
      var scroller = document.scrollingElement || document.documentElement;
      scroller.scrollTop = target;
      try { window.scrollTo(0, target); } catch (e) { /* ignore */ }
      var reached = Math.abs((scroller.scrollTop || 0) - target) < 4;
      if (reached || Date.now() - startedAt > 8000) {
        finish();
        return true;
      }
      return false;
    }

    try {
      observer = new MutationObserver(function () { attempt(); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* observer optional; retry interval still runs */ }
    retryTimer = setInterval(attempt, 250);
    attempt();
  }

  /* ---------------- toast ---------------- */

  function removeToast() {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toast) {
      toast.remove();
      toast = null;
    }
  }

  function showToast(kept, total) {
    if (settings.quietMode) return;
    if (!document.body) return;
    removeToast();
    toast = document.createElement("div");
    toast.className = "suc-toast";
    toast.textContent = "Showing " + kept + " of " + total + " messages — chat boosted";
    document.body.appendChild(toast);
    // Force a frame so the CSS transition plays.
    requestAnimationFrame(function () {
      if (toast) toast.classList.add("suc-toast-visible");
    });
    toastTimer = setTimeout(removeToast, 4000);
  }

  /* ---------------- conversation events from MAIN world ---------------- */

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.source !== "suc" || data.type !== "conversation") return;
    // A prior request may finish after SPA navigation. Correlate the result
    // before enabling export or showing stats for the page currently open.
    checkUrlChanged();
    var payload = data.payload;
    var chatId = currentChatId();
    if (!chatId || !payload || typeof payload.conversationId !== "string" ||
        payload.conversationId.toLowerCase() !== chatId) return;
    window.__sucLastConversation = payload;
    lastStats = payload.stats || null;
    updateButton();
    if (lastStats && lastStats.hidden > 0) {
      loadSettings(function () {
        if (lastStats) showToast(lastStats.kept, lastStats.total);
      });
    }
  });

  /* ---------------- popup <-> content messages ---------------- */

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || typeof msg.type !== "string") return false;
    checkUrlChanged();

    if (msg.type === "suc:getStats") {
      loadSettings(function (s) {
        checkUrlChanged(); // The URL can change while storage is being read.
        var st = lastStats || {};
        sendResponse({
          enabled: s.enabled,
          messageLimit: s.messageLimit,
          batchSize: s.batchSize,
          quietMode: s.quietMode,
          visible: st.kept || 0,
          hidden: st.hidden || 0,
          total: st.total || 0,
          hasConversation: !!window.__sucLastConversation
        });
      });
      return true; // async sendResponse
    }

    if (msg.type === "suc:export") {
      var ok = false;
      if (window.__sucLastConversation && typeof window.__sucExport === "function") {
        try {
          ok = window.__sucExport(msg.format) !== false;
        } catch (e) {
          ok = false;
        }
      }
      sendResponse(ok ? { ok: true } : { ok: false, error: "no conversation" });
      return false;
    }

    if (msg.type === "suc:reloadTab") {
      location.reload();
      return false;
    }

    return false;
  });

  /* ---------------- SPA navigation ---------------- */

  function resetConversationState() {
    window.__sucLastConversation = null;
    lastStats = null;
    removeToast();
    updateButton();
  }

  function checkUrlChanged() {
    if (location.href === currentUrl) return;
    var prevChat = chatIdFrom(currentUrl);
    currentUrl = location.href;
    var nextChat = currentChatId();
    if (prevChat !== nextChat) resetConversationState();
  }

  window.addEventListener("popstate", checkUrlChanged);
  setInterval(checkUrlChanged, 1000);

  /* ---------------- init ---------------- */

  loadSettings(function () { updateButton(); });
  restoreScrollIfPending();
})();
