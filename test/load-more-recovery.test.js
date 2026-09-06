'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../content/page-ui.js'), 'utf8');
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
function harness() {
  const events = {}, elements = [], reads = [], writes = [], scroll = [];
  let reloads = 0;
  const mode = { readError: false, writeError: false, throwRead: false, throwWrite: false, deferRead: false, deferWrite: false };
  const settings = { enabled: true, messageLimit: 15, batchSize: 10, quietMode: true };
  const location = { href: `https://chatgpt.com/c/${A}`, origin: 'https://chatgpt.com', reload() { reloads++; } };
  const window = { addEventListener(name, fn) { events[name] = fn; }, scrollY: 37 };
  const runtime = { onMessage: { addListener() {} } };
  function callback(fn, value, failed) {
    runtime.lastError = failed ? { message: 'Storage unavailable' } : undefined;
    try { fn(value); } finally { delete runtime.lastError; }
  }
  const chrome = { runtime, storage: { local: {
    get(key, fn) {
      if (mode.throwRead) throw new Error('Read failed');
      const run = () => callback(fn, { suc_settings: settings }, mode.readError);
      reads.push(run); if (!mode.deferRead) run();
    },
    set(value, fn) {
      if (mode.throwWrite) throw new Error('Write failed');
      const run = () => callback(fn, undefined, mode.writeError);
      writes.push({ value, run }); if (!mode.deferWrite) run();
    },
  } } };
  const document = { body: { appendChild() {} }, scrollingElement: { scrollTop: 37 },
    createElement() { const handlers = {}; const e = { isConnected: true, disabled: false,
      classList: { add() {}, remove() {} }, addEventListener(name, fn) { handlers[name] = fn; },
      click() { handlers.click(); }, remove() {} }; elements.push(e); return e; } };
  vm.runInNewContext(source, { window, location, document, chrome, URL,
    sessionStorage: { getItem() { return null; }, setItem(key, value) { scroll.push([key, value]); } },
    setInterval() {}, clearInterval() {}, clearTimeout() {},
  });
  events.message({ source: window, data: { source: 'suc', type: 'conversation', payload: {
    conversationId: A, json: {}, stats: { kept: 15, hidden: 20, total: 35, hasOlderMessages: true },
  } } });
  reads.length = 0;
  return { mode, location, reads, writes, scroll, button: elements[0], get reloads() { return reloads; } };
}
test('successful load more increases the limit once and restores scroll only after save', () => {
  const e = harness(); e.button.click();
  assert.equal(e.writes.length, 1); assert.equal(e.writes[0].value.suc_settings.messageLimit, 25);
  assert.equal(e.writes[0].value.suc_settings.quietMode, true);
  assert.equal(e.reloads, 1); assert.equal(e.scroll.length, 2);
});
test('a failed storage callback does not reload and allows a successful retry', () => {
  const e = harness(); e.mode.writeError = true; e.button.click();
  assert.equal(e.reloads, 0); assert.equal(e.scroll.length, 0); assert.equal(e.button.disabled, false);
  e.mode.writeError = false; e.button.click(); assert.equal(e.reloads, 1);
});
test('a synchronous write failure does not reload or leave the button locked', () => {
  const e = harness(); e.mode.throwWrite = true; e.button.click();
  assert.equal(e.reloads, 0); assert.equal(e.button.disabled, false); assert.equal(e.scroll.length, 0);
});
for (const failure of ['readError', 'throwRead']) {
  test(`a ${failure} cannot overwrite preferences using a fallback snapshot`, () => {
    const e = harness(); e.mode[failure] = true; e.button.click();
    assert.equal(e.writes.length, 0); assert.equal(e.reloads, 0); assert.equal(e.button.disabled, false);
  });
}
test('duplicate clicks while reading settings share one operation', () => {
  const e = harness(); e.mode.deferRead = true; e.button.click(); e.button.click();
  assert.equal(e.reads.length, 1); assert.equal(e.button.disabled, true);
  e.reads[0](); assert.equal(e.writes.length, 1); assert.equal(e.reloads, 1);
});
test('duplicate clicks while saving do not queue multiple reloads', () => {
  const e = harness(); e.mode.deferWrite = true; e.button.click(); e.button.click();
  assert.equal(e.writes.length, 1); assert.equal(e.button.disabled, true);
  e.writes[0].run(); assert.equal(e.reloads, 1);
});
test('navigation during settings read prevents a stale load-more write', () => {
  const e = harness(); e.mode.deferRead = true; e.button.click();
  e.location.href = `https://chatgpt.com/c/${B}`; e.reads[0]();
  assert.equal(e.writes.length, 0); assert.equal(e.reloads, 0); assert.equal(e.button.disabled, false);
});
test('navigation during save does not reload the newly opened conversation', () => {
  const e = harness(); e.mode.deferWrite = true; e.button.click();
  e.location.href = `https://chatgpt.com/c/${B}`; e.writes[0].run();
  assert.equal(e.reloads, 0); assert.equal(e.scroll.length, 0);
});
test('a stale button on the new-chat route cannot start load-more', () => {
  const e = harness(); e.location.href = 'https://chatgpt.com/'; e.button.click();
  assert.equal(e.writes.length, 0); assert.equal(e.reloads, 0);
});
