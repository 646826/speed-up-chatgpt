/* Speed Up ChatGPT — export preview page.
 *
 * Contract:
 * - Opened by the background service worker as preview/preview.html?k=<key>.
 * - The exporter stored {html, title} in chrome.storage.local under <key>
 *   ("suc_export_<ts>"); the HTML is already safely built (escaped) there.
 * - This page injects that HTML, removes the storage key, and auto-triggers
 *   window.print() shortly after load.
 */
(function () {
  "use strict";

  var PRINT_DELAY_MS = 500;

  function showError(message) {
    var content = document.getElementById("content");
    var box = document.createElement("div");
    box.className = "error-box";
    box.textContent = message;
    content.replaceWith(box);
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    var key = params.get("k");

    if (!key) {
      showError("Missing export key. Please re-run the PDF export from the popup.");
      return;
    }

    chrome.storage.local.get(key, function (data) {
      var err = chrome.runtime.lastError;
      var entry = data && data[key];

      if (err || !entry || typeof entry.html !== "string") {
        showError("Export data not found or already consumed. Please re-run the PDF export.");
        return;
      }

      // One-shot payload: free the storage key right after reading.
      chrome.storage.local.remove(key);

      if (entry.title) {
        document.title = entry.title;
      }

      // The HTML is pre-sanitized/escaped by export/exporter.js.
      document.getElementById("content").innerHTML = entry.html;

      // Auto-open the print dialog (user can pick "Save as PDF").
      setTimeout(function () {
        window.print();
      }, PRINT_DELAY_MS);
    });
  }

  document.getElementById("printBtn").addEventListener("click", function () {
    window.print();
  });

  document.addEventListener("DOMContentLoaded", init);
})();
