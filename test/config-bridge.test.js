"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const bridge = fs.readFileSync(path.join(__dirname, '../content/config-bridge.js'), 'utf8');
const interceptor = fs.readFileSync(path.join(__dirname, '../content/main-interceptor.js'), 'utf8');
const endpoint = 'https://chatgpt.com/backend-api/conversation/12345678-1234-1234-1234-123456789abc';
function harness({ blocked = false, getThrows = false } = {}) {
  const listeners = new Map();
  const cache = new Map([['suc_config', JSON.stringify({ enabled: true, messageLimit: 1 })]]);
  let initial, changed, runtimeError;
  let errorReads = 0;
  const mapping = { root: { id: 'root', parent: null, children: ['m1'], message: null } };
  for (let i = 1; i <= 4; i++) mapping['m'+i] = {
    id: 'm'+i, parent: i === 1 ? 'root' : 'm'+(i-1), children: i === 4 ? [] : ['m'+(i+1)],
    message: { content: { parts: ['Message '+i] } }
  };
  const window = {
    location: { href: 'https://chatgpt.com/c/example' },
    addEventListener(type, fn) { listeners.set(type, fn); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); },
    postMessage() {},
    async fetch() { return new Response(JSON.stringify({ mapping, current_node:'m4' }), { headers: {'content-type':'application/json'} }); }
  };
  const context = vm.createContext({window, URL, Request, Response, Headers, structuredClone,
    CustomEvent: class { constructor(type, options) { this.type=type; this.detail=options.detail; } },
    localStorage: { getItem: key => { if (blocked) throw Error('blocked'); return cache.get(key); }, setItem(key, value) { if (blocked) throw Error('blocked'); cache.set(key, value); } },
    chrome: {
      runtime: { get lastError() { errorReads++; return runtimeError; } },
      storage: { local: { get(key, cb) { if (getThrows) throw Error('context invalidated'); initial=cb; } },
        onChanged: { addListener(fn) { changed=fn; } } }
    }
  });
  vm.runInContext(bridge, context);
  vm.runInContext(interceptor, context);
  return {
    cache,
    initial(value, error) { runtimeError=error; initial({suc_settings:value}); runtimeError=undefined; },
    change(value, area='local') { changed({suc_settings:{newValue:value}},area); },
    get errorReads() { return errorReads; },
    async visibleIds() { const response = await window.fetch(endpoint); return Object.keys((await response.json()).mapping).filter(id=>id!=='root'); }
  };
}
test('initial disabled setting reaches an already running interceptor', async () => {
  const env=harness(); env.initial({enabled:false});
  assert.deepEqual(await env.visibleIds(), ['m1','m2','m3','m4']);
});
test('initial message limit is applied without reloading the page', async () => {
  const env=harness(); env.initial({messageLimit:2});
  assert.deepEqual(await env.visibleIds(), ['m3','m4']);
});
test('initial settings still apply when page localStorage is blocked', async () => {
  const env=harness({blocked:true}); env.initial({messageLimit:2});
  assert.deepEqual(await env.visibleIds(), ['m3','m4']);
});
test('a delayed initial snapshot cannot overwrite a newer settings change', async () => {
  const env=harness(); env.change({messageLimit:3}); env.initial({messageLimit:1});
  assert.equal(JSON.parse(env.cache.get('suc_config')).messageLimit,3);
  assert.deepEqual(await env.visibleIds(), ['m2','m3','m4']);
});
test('a failed initial read preserves the last cached settings and consumes lastError', async () => {
  const env=harness(); env.initial(undefined,{message:'storage unavailable'});
  assert.equal(JSON.parse(env.cache.get('suc_config')).messageLimit,1);
  assert.ok(env.errorReads>0);
  assert.deepEqual(await env.visibleIds(), ['m4']);
});
test('unrelated storage areas cannot suppress the initial settings', async () => {
  const env=harness(); env.change({messageLimit:4},'sync'); env.initial({messageLimit:2});
  assert.deepEqual(await env.visibleIds(), ['m3','m4']);
});
test('removing settings restores defaults through the same live bridge', async () => {
  const env=harness(); env.initial({messageLimit:1}); env.change(undefined);
  assert.deepEqual(await env.visibleIds(), ['m1','m2','m3','m4']);
});
test('synchronous initial storage failure does not abort script initialization', async () => {
  const env=harness({getThrows:true});
  assert.deepEqual(await env.visibleIds(), ['m4']);
});
