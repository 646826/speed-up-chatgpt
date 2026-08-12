// Speed Up ChatGPT — MAIN-world interceptor (document_start)
// Contains:
//  1. trimConversation(convJson, limit) — a pure, node-testable function that
//     trims a ChatGPT conversation JSON to the latest `limit` visible
//     messages on the active branch.
//  2. A window.fetch patch (browser only) that intercepts conversation API
//     responses and replaces them with the trimmed version.

"use strict";

/**
 * Trim a ChatGPT conversation JSON to the last `limit` visible messages
 * of the active branch (path from the root to current_node).
 *
 * Pure function: the input object is never mutated; kept nodes are deep
 * copies with re-linked parent/children references.
 *
 * @param {object} convJson ChatGPT conversation JSON ({title, mapping, current_node})
 * @param {number} limit    max number of visible messages to keep
 * @returns {{json: object, stats: {total: number, kept: number, hidden: number, hasOlderMessages: boolean}}}
 */
function trimConversation(convJson, limit) {
  const emptyStats = { total: 0, kept: 0, hidden: 0, hasOlderMessages: false };
  if (!convJson || typeof convJson !== "object" || !convJson.mapping || typeof convJson.mapping !== "object") {
    return { json: convJson, stats: emptyStats };
  }

  const mapping = convJson.mapping;
  const mappingSize = Object.keys(mapping).length;

  // 1. Walk from current_node up via `parent` links to the root.
  //    `path` ends up ordered from the root down to current_node.
  //    Guarded against cycles (visited set + iteration cap).
  const path = [];
  const visited = new Set();
  let nodeId = convJson.current_node;
  let iterations = 0;
  while (nodeId != null && Object.prototype.hasOwnProperty.call(mapping, nodeId) &&
         !visited.has(nodeId) && iterations <= mappingSize) {
    visited.add(nodeId);
    path.push(nodeId);
    nodeId = mapping[nodeId] ? mapping[nodeId].parent : null;
    iterations++;
  }
  path.reverse(); // root -> ... -> current_node

  // 2. Keep only "visible" nodes on the active branch: they have a message
  //    with content parts and are not flagged as visually hidden.
  const visibleIds = path.filter((id) => {
    const node = mapping[id];
    const msg = node && node.message;
    if (!msg || !msg.content || !Array.isArray(msg.content.parts)) return false;
    if (msg.metadata && msg.metadata.is_visually_hidden_from_conversation === true) return false;
    return true;
  });

  // 3. total = number of visible nodes; keptIds = last `limit` of them.
  const total = visibleIds.length;
  let n = typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : total;
  if (n < 0) n = 0;

  // 7. Nothing to trim — return the original JSON untouched.
  if (total <= n) {
    return {
      json: convJson,
      stats: { total: total, kept: total, hidden: 0, hasOlderMessages: false },
    };
  }

  const keptIds = visibleIds.slice(total - n);
  const rootId = path.length > 0 ? path[0] : null;

  // 4. New mapping = (deep-copied) root + deep-copied kept nodes, re-linked
  //    into a single linear chain. All other node fields are preserved.
  const newMapping = {};

  if (rootId != null && Object.prototype.hasOwnProperty.call(mapping, rootId)) {
    const rootCopy = sucDeepClone(mapping[rootId]);
    rootCopy.children = keptIds.length > 0 ? [keptIds[0]] : [];
    newMapping[rootId] = rootCopy;
  }

  for (let i = 0; i < keptIds.length; i++) {
    const id = keptIds[i];
    const copy = sucDeepClone(mapping[id]);
    copy.parent = i === 0 ? rootId : keptIds[i - 1];
    copy.children = i < keptIds.length - 1 ? [keptIds[i + 1]] : [];
    newMapping[id] = copy;
  }

  // 5. Preserve current_node (and all other top-level fields) as-is.
  const newJson = Object.assign({}, convJson, { mapping: newMapping });

  // 6. Stats.
  const kept = keptIds.length;
  const hidden = total - kept;
  return {
    json: newJson,
    stats: { total: total, kept: kept, hidden: hidden, hasOlderMessages: hidden > 0 },
  };
}

function sucDeepClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Browser-only part: patch window.fetch. Guarded so that requiring this file
// in node (for tests) never touches browser APIs.
// ---------------------------------------------------------------------------
if (typeof window !== "undefined" && typeof window.fetch === "function") {
  (function () {
    if (window.fetch.__sucPatched) return; // avoid double-patching

    const originalFetch = window.fetch;
    const CONVERSATION_URL_RE =
      /^https:\/\/(chatgpt\.com|chat\.openai\.com)\/backend-api\/conversation\/[0-9a-f-]{36}$/;
    const DEFAULT_CONFIG = { enabled: true, messageLimit: 15, batchSize: 10, quietMode: false };

    // Initial config: written to localStorage by content/config-bridge.js
    // (isolated world) before this MAIN-world script runs.
    let config = Object.assign({}, DEFAULT_CONFIG);
    try {
      const raw = localStorage.getItem("suc_config");
      if (raw) config = Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
    } catch (err) {
      // Missing/malformed config — fall back to defaults.
    }

    // Live config updates from config-bridge.js (detail = JSON string).
    window.addEventListener("suc:set-config", (event) => {
      try {
        const next = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
        config = Object.assign({}, DEFAULT_CONFIG, next);
      } catch (err) {
        // Ignore malformed updates.
      }
    });

    function requestMethod(input, init) {
      if (init && init.method) return String(init.method).toUpperCase();
      if (typeof Request !== "undefined" && input instanceof Request && input.method) {
        return String(input.method).toUpperCase();
      }
      return "GET";
    }

    function requestUrl(input) {
      try {
        if (typeof input === "string") return input;
        if (input && input.url) return String(input.url);
      } catch (err) {
        // fall through
      }
      return "";
    }

    async function sucFetch(input, init) {
      const url = requestUrl(input);
      const isConversationGet =
        requestMethod(input, init) === "GET" && CONVERSATION_URL_RE.test(url);

      const resp = await originalFetch.apply(this, arguments);
      if (!isConversationGet) return resp;

      try {
        if (resp.status !== 200) return resp;
        const contentType = (resp.headers.get("content-type") || "").toLowerCase();
        if (contentType.indexOf("json") === -1) return resp;

        const clone = resp.clone();
        const data = await clone.json();

        const enabled = config.enabled !== false;
        // When disabled, use an effectively infinite limit: the trimmer then
        // returns the JSON unchanged with stats kept=total, hidden=0 — the
        // response passes through unmodified but the UI/export still get data.
        const limit = enabled ? config.messageLimit : Number.MAX_SAFE_INTEGER;
        const result = trimConversation(data, limit);

        // Notify the isolated-world UI/exporter with the FULL original JSON.
        window.postMessage(
          {
            source: "suc",
            type: "conversation",
            payload: { json: data, stats: result.stats },
          },
          "*"
        );

        if (!enabled || result.json === data) return resp; // pass through unchanged

        // Rebuild the response with the trimmed body. content-encoding and
        // content-length must be dropped: the body is now a plain,
        // re-serialized string of a different length.
        const headers = new Headers(resp.headers);
        headers.delete("content-encoding");
        headers.delete("content-length");
        return new Response(JSON.stringify(result.json), {
          status: resp.status,
          statusText: resp.statusText,
          headers: headers,
        });
      } catch (err) {
        // Any parsing/rebuilding failure: return the original response.
        return resp;
      }
    }

    sucFetch.__sucPatched = true;
    window.fetch = sucFetch;
  })();
}

// Node-test hook (no-op in the browser).
if (typeof module !== "undefined") {
  module.exports = { trimConversation };
}
