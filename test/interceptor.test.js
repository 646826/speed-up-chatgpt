"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(path.join(__dirname, "../content/main-interceptor.js"), "utf8");
const conversationPath = "/backend-api/conversation/12345678-1234-1234-1234-123456789abc";
const absoluteUrl = "https://chatgpt.com" + conversationPath;

function conversation() {
  const mapping = { root: { id: "root", parent: null, children: ["m1"], message: null } };
  for (let i = 1; i <= 4; i++) {
    mapping["m" + i] = {
      id: "m" + i,
      parent: i === 1 ? "root" : "m" + (i - 1),
      children: i === 4 ? [] : ["m" + (i + 1)],
      message: { content: { parts: ["Message " + i] }, metadata: {} },
    };
  }
  return { title: "Regression fixture", mapping, current_node: "m4" };
}

function loadInterceptor(options = {}) {
  const full = conversation();
  const response = options.response || new Response(JSON.stringify(full), {
    status: 200,
    headers: { "content-type": "application/json", "content-length": "9999", "content-encoding": "gzip", "x-test": "kept" },
  });
  const calls = [];
  const messages = [];
  const window = {
    location: { href: "https://chatgpt.com/c/example" },
    fetch: async function (input, init) {
      calls.push({ input, init, receiver: this });
      if (options.failure) throw options.failure;
      return response;
    },
    addEventListener() {},
    postMessage(message) { messages.push(JSON.parse(JSON.stringify(message))); },
  };
  const context = vm.createContext({
    window,
    document: { baseURI: options.baseURI || window.location.href },
    URL, Request, Response, Headers, structuredClone,
    localStorage: { getItem: () => JSON.stringify({ messageLimit: 2, ...options.config }) },
  });
  vm.runInContext(source, context);
  return { window, context, calls, messages, response, full };
}

for (const [name, input] of [
  ["absolute string", absoluteUrl],
  ["root-relative string", conversationPath],
  ["query parameters", absoluteUrl + "?view=latest"],
  ["relative string with query and fragment", conversationPath + "?view=latest#message"],
  ["URL object", new URL(absoluteUrl)],
  ["Request object with query", new Request(absoluteUrl + "?view=latest")],
  ["legacy host", "https://chat.openai.com" + conversationPath + "?view=latest"],
  ["default HTTPS port", "https://chatgpt.com:443" + conversationPath + "?view=latest"],
]) {
  test("trims conversation fetched using " + name, async () => {
    const env = loadInterceptor();
    const response = await env.window.fetch(input);
    const body = await response.json();
    assert.deepEqual(Object.keys(body.mapping), ["root", "m3", "m4"]);
    assert.equal(body.current_node, "m4");
    assert.equal(env.messages.length, 1);
    assert.deepEqual(env.messages[0].payload.json, env.full, "export must retain the full conversation");
    assert.deepEqual(env.messages[0].payload.stats, { total: 4, kept: 2, hidden: 2, hasOlderMessages: true });
    assert.equal(env.calls[0].input, input, "do not replace the caller's fetch input");
  });
}

for (const [name, input, init] of [
  ["foreign origin", "https://example.com" + conversationPath],
  ["lookalike hostname", "https://chatgpt.com.example.com" + conversationPath],
  ["non-default port", "https://chatgpt.com:444" + conversationPath],
  ["HTTP", "http://chatgpt.com" + conversationPath],
  ["conversation subresource", absoluteUrl + "/messages"],
  ["POST", absoluteUrl, { method: "POST" }],
  ["Request POST", new Request(absoluteUrl, { method: "POST" })],
  ["init method overriding Request GET", new Request(absoluteUrl), { method: "PATCH" }],
]) {
  test("does not intercept " + name, async () => {
    const env = loadInterceptor();
    assert.equal(await env.window.fetch(input, init), env.response);
    assert.equal(env.messages.length, 0);
  });
}

test("resolves relative inputs against document.baseURI, not just location", async () => {
  const env = loadInterceptor({ baseURI: "https://example.com/" });
  assert.equal(await env.window.fetch(conversationPath), env.response);
  assert.equal(env.messages.length, 0);
});

test("preserves fetch arguments and receiver while dropping obsolete body headers", async () => {
  const env = loadInterceptor();
  const receiver = {};
  const init = { method: "get", credentials: "include" };
  const response = await env.window.fetch.call(receiver, absoluteUrl, init);
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].init, init);
  assert.equal(env.calls[0].receiver, receiver);
  assert.equal(response.headers.get("content-length"), null);
  assert.equal(response.headers.get("content-encoding"), null);
  assert.equal(response.headers.get("x-test"), "kept");
});

test("disabled acceleration keeps the original response and full export", async () => {
  const env = loadInterceptor({ config: { enabled: false } });
  assert.equal(await env.window.fetch(absoluteUrl), env.response);
  assert.deepEqual(env.messages[0].payload.json, env.full);
  assert.equal(env.messages[0].payload.stats.hidden, 0);
});

test("malformed JSON fails open without consuming the original response", async () => {
  const invalidResponse = new Response("not json", {
    headers: { "content-type": "application/json" },
  });
  const env = loadInterceptor({ response: invalidResponse });
  const response = await env.window.fetch(absoluteUrl);
  assert.equal(response, env.response);
  assert.equal(await response.text(), "not json");
});

test("network failures propagate unchanged", async () => {
  const failure = new Error("network unavailable");
  const env = loadInterceptor({ failure });
  await assert.rejects(env.window.fetch(absoluteUrl), (error) => error === failure);
});

test("injecting twice does not wrap fetch twice", async () => {
  const env = loadInterceptor();
  const fetch = env.window.fetch;
  vm.runInContext(source, env.context);
  assert.equal(env.window.fetch, fetch);
  await env.window.fetch(absoluteUrl);
  assert.equal(env.calls.length, 1);
  assert.equal(env.messages.length, 1);
});
