"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const uiSource = readFileSync(path.join(__dirname, "../content/page-ui.js"), "utf8");
const interceptorSource = readFileSync(path.join(__dirname, "../content/main-interceptor.js"), "utf8");
const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
function harness() {
  const events = new Map(), intervals = [], reads = [];
  let handler, delayed = false;
  const location = { href: "https://chatgpt.com/c/" + A, origin: "https://chatgpt.com", reload() {} };
  const window = { addEventListener(name, callback) { events.set(name, callback); } };
  const chrome = {
    runtime: { onMessage: { addListener(callback) { handler = callback; } } },
    storage: { local: { get(key, callback) {
      if (delayed) reads.push(callback); else callback({ suc_settings: { quietMode: true } });
    } } },
  };
  const context = vm.createContext({ window, location, chrome, URL,
    sessionStorage: { getItem() { return null; } },
    setInterval(callback) { intervals.push(callback); return intervals.length; },
    clearInterval() {}, clearTimeout() {},
  });
  vm.runInContext(uiSource, context);
  const payload = (id) => ({ conversationId: id, json: { title: id }, stats: { kept: 2, total: 2, hidden: 0, hasOlderMessages: false } });
  return { window, location, reads,
    emit(id) { const value = payload(id); events.get("message")({ source: window, data: { source: "suc", type: "conversation", payload: value } }); return value; },
    async send(type) { return new Promise(resolve => handler({ type, format: "md" }, {}, resolve)); },
    poll() { intervals[0](); },
    delayReads() { delayed = true; },
  };
}
test("accepts a response for the current conversation", async () => {
  const env = harness(); const payload = env.emit(A);
  assert.equal(env.window.__sucLastConversation, payload);
  assert.equal((await env.send("suc:getStats")).total, 2);
});
test("a late response for another conversation cannot overwrite the current export", async () => {
  const env = harness(); env.emit(A); env.location.href = "https://chatgpt.com/c/" + B;
  const current = env.emit(B); env.emit(A);
  assert.equal(env.window.__sucLastConversation, current);
});
test("navigation polling does not erase a response already accepted for the new URL", () => {
  const env = harness(); env.emit(A); env.location.href = "https://chatgpt.com/c/" + B;
  const current = env.emit(B); env.poll();
  assert.equal(env.window.__sucLastConversation, current);
});
test("export refuses a stale conversation before the navigation timer runs", async () => {
  const env = harness(); env.emit(A); let exports = 0;
  env.window.__sucExport = () => { exports++; return true; };
  env.location.href = "https://chatgpt.com/c/" + B;
  assert.equal((await env.send("suc:export")).ok, false); assert.equal(exports, 0);
});
test("stats are cleared immediately on navigation", async () => {
  const env = harness(); env.emit(A); env.location.href = "https://chatgpt.com/c/" + B;
  const stats = await env.send("suc:getStats");
  assert.equal(stats.hasConversation, false); assert.equal(stats.total, 0);
});
test("navigation while an async settings read is pending does not return stale stats", async () => {
  const env = harness(); env.emit(A); env.delayReads();
  const result = env.send("suc:getStats"); env.location.href = "https://chatgpt.com/c/" + B;
  env.reads.shift()({ suc_settings: { quietMode: true } });
  assert.equal((await result).hasConversation, false);
});
test("late responses on the new-chat page are ignored", () => {
  const env = harness(); env.location.href = "https://chatgpt.com/"; env.emit(A);
  assert.equal(env.window.__sucLastConversation, null);
});
test("uncorrelated payloads do not enable export", () => {
  const env = harness(); env.emit(undefined);
  assert.ok(!env.window.__sucLastConversation);
});
test("same-chat query changes and case differences preserve the conversation", () => {
  const env = harness(); env.location.href = "https://chatgpt.com/g/project/c/" + A.toUpperCase();
  const current = env.emit(A); env.location.href += "?view=latest"; env.poll();
  assert.equal(env.window.__sucLastConversation, current);
});
test("the real interceptor tags full export payloads with the request conversation ID", async () => {
  for (const suffix of ["", "?view=latest"]) {
    const data = { title: "fixture", mapping: {}, current_node: null };
    const messages = [];
    const window = { location: { href: "https://chatgpt.com/c/" + A },
      fetch: async () => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } }),
      addEventListener() {}, postMessage(message) { messages.push(message); } };
    vm.runInNewContext(interceptorSource, { window, URL, Request, Response, Headers, structuredClone,
      localStorage: { getItem() { return null; } } });
    await window.fetch("/backend-api/conversation/" + B + suffix);
    assert.equal(messages[0].payload.conversationId, B);
    assert.deepEqual(messages[0].payload.json, data);
  }
});
