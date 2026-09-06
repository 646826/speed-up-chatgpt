/* Speed Up ChatGPT — exporter (isolated world, document_idle, after page-ui.js).
 * Defines window.__sucExport(format): md / txt / json downloads, pdf via preview page.
 * Reads the last full conversation from window.__sucLastConversation (set by page-ui.js).
 */
(function () {
  "use strict";

  /* ---------------- message extraction (active branch) ---------------- */

  function extractMessages(json) {
    if (!json || !json.mapping || !json.current_node) return [];
    var mapping = json.mapping;
    var seen = new Set();
    var path = [];
    var nodeId = json.current_node;

    // Mapping keys are the graph identity; embedded node.id can be absent or
    // duplicated. Only follow own entries, never Object.prototype properties.
    while (nodeId != null && Object.prototype.hasOwnProperty.call(mapping, nodeId) && !seen.has(nodeId)) {
      seen.add(nodeId);
      var node = mapping[nodeId];
      if (!node || typeof node !== "object") break;
      path.push(node);
      nodeId = node.parent;
    }
    path.reverse();

    var messages = [];
    for (var i = 0; i < path.length; i++) {
      var m = path[i].message;
      if (!m || !m.content || !Array.isArray(m.content.parts)) continue;
      if (m.metadata && m.metadata.is_visually_hidden_from_conversation === true) continue;
      var role = m.author && m.author.role;
      var who = role === "user" ? "You" : role === "assistant" ? "ChatGPT" : null;
      if (!who) continue; // skip system/tool and anything else
      var text = m.content.parts
        .filter(function (p) { return typeof p === "string"; })
        .join("\n");
      messages.push({ role: who, text: text });
    }
    return messages;
  }

  /* ---------------- helpers ---------------- */

  function slugify(title) {
    var s = String(title || "conversation")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
      .replace(/^-+|-+$/g, "");
    if (!s) s = "conversation";
    return Array.from(s).slice(0, 40).join("");
  }

  function todayStamp() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------------- format builders ---------------- */

  function buildMarkdown(title, messages) {
    var out = "# " + title + "\n\n";
    for (var i = 0; i < messages.length; i++) {
      out += "## " + messages[i].role + "\n\n" + messages[i].text + "\n\n";
    }
    return out;
  }

  function buildText(messages) {
    var blocks = [];
    for (var i = 0; i < messages.length; i++) {
      blocks.push(messages[i].role + ":\n" + messages[i].text + "\n");
    }
    return blocks.join("\n---\n\n");
  }

  function buildPrintHtml(title, messages) {
    var body = "";
    for (var i = 0; i < messages.length; i++) {
      body += '<section class="suc-msg">' +
        "<h2>" + escapeHtml(messages[i].role) + "</h2>" +
        "<pre>" + escapeHtml(messages[i].text) + "</pre>" +
        "</section>";
    }
    return (
      '<style>' +
      '.suc-print{max-width:720px;margin:0 auto;padding:24px;' +
      'font-family:Charter,Georgia,"Times New Roman",serif;color:#1a1a1a;}' +
      '.suc-print h1{font-size:22px;margin:0 0 16px;}' +
      '.suc-print h2{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
      'font-size:13px;text-transform:uppercase;letter-spacing:.04em;' +
      'color:#10a37f;margin:24px 0 8px;}' +
      '.suc-print pre{background:#f5f5f5;border-radius:6px;padding:12px;' +
      'white-space:pre-wrap;word-wrap:break-word;font-size:13px;line-height:1.5;margin:0;}' +
      "@media print{.suc-print{padding:0;}}" +
      "</style>" +
      '<div class="suc-print">' +
      "<h1>" + escapeHtml(title) + "</h1>" +
      body +
      "</div>"
    );
  }

  /* ---------------- public API ---------------- */

  window.__sucExport = function (format) {
    var conv = window.__sucLastConversation;
    if (!conv || !conv.json) return false;

    var json = conv.json;
    var title = json.title || "conversation";
    var base = slugify(title) + "-" + todayStamp();
    var messages = extractMessages(json);

    if (format === "json") {
      downloadBlob(
        new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }),
        base + ".json"
      );
      return true;
    }

    if (format === "md") {
      downloadBlob(
        new Blob([buildMarkdown(title, messages)], { type: "text/markdown;charset=utf-8" }),
        base + ".md"
      );
      return true;
    }

    if (format === "txt") {
      downloadBlob(
        new Blob([buildText(messages)], { type: "text/plain;charset=utf-8" }),
        base + ".txt"
      );
      return true;
    }

    if (format === "pdf") {
      var key = "suc_export_" + Date.now();
      var payload = {};
      payload[key] = { html: buildPrintHtml(title, messages), title: title };
      try {
        chrome.storage.local.set(payload, function () {
          chrome.runtime.sendMessage({ type: "suc:openPreview", key: key });
        });
      } catch (e) {
        return false;
      }
      return true;
    }

    return false;
  };
})();
