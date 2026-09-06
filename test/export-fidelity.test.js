"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = readFileSync(path.join(__dirname, "../export/exporter.js"), "utf8");
function message(text, role = "user", hidden = false) {
  return { author: { role }, content: { parts: [text] }, metadata: { is_visually_hidden_from_conversation: hidden } };
}
function fixture() {
  return { title: "Обсуждение проекта", current_node: "last", mapping: {
    root: { parent: null, message: null },
    first: { parent: "root", message: message("Первое сообщение") },
    other: { parent: "first", message: message("WRONG BRANCH") },
    last: { parent: "first", message: message("Final answer", "assistant") },
  } };
}
function exporter(json) {
  const downloads = [], previews = [], blobs = new Map();
  let serial = 0;
  const window = { __sucLastConversation: json ? { json } : null };
  const context = vm.createContext({ window, Blob,
    URL: { createObjectURL(blob) { const url = "blob:" + ++serial; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
    document: { createElement() { return { click() { downloads.push({ filename: this.download, blob: blobs.get(this.href) }); }, remove() {} }; }, body: { appendChild() {} } },
    chrome: { storage: { local: { set(payload, callback) { previews.push(Object.values(payload)[0]); callback(); } } }, runtime: { sendMessage() {} } },
    setTimeout() {},
  });
  vm.runInContext(source, context);
  return { run: window.__sucExport, downloads, previews };
}
for (const format of ["md", "txt", "pdf"]) {
  test(format + " exports every active-branch message when node IDs are absent", async () => {
    const env = exporter(fixture());
    assert.equal(env.run(format), true);
    const output = format === "pdf" ? env.previews[0].html : await env.downloads[0].blob.text();
    assert.ok(output.includes("Первое сообщение"));
    assert.ok(output.includes("Final answer"));
    assert.ok(output.indexOf("Первое сообщение") < output.indexOf("Final answer"));
    assert.ok(!output.includes("WRONG BRANCH"));
  });
}
test("map keys, not duplicate embedded IDs, identify the active path", async () => {
  const json = fixture();
  for (const node of Object.values(json.mapping)) node.id = "duplicate";
  const env = exporter(json); env.run("txt");
  assert.match(await env.downloads[0].blob.text(), /Первое сообщение/);
});
test("prototype-like map keys do not stop traversal", async () => {
  const json = { title: "Test", current_node: "toString", mapping: JSON.parse('{"__proto__":{"parent":null,"message":null},"constructor":{"parent":"__proto__"},"toString":{"parent":"constructor"}}') };
  json.mapping.constructor.message = message("Earlier"); json.mapping.toString.message = message("Later");
  const env = exporter(json); env.run("txt");
  assert.match(await env.downloads[0].blob.text(), /Earlier[\s\S]*Later/);
});
test("cycles terminate without duplicating messages", async () => {
  const json = fixture(); json.mapping.first.parent = "last";
  const env = exporter(json); env.run("txt");
  const text = await env.downloads[0].blob.text();
  assert.equal(text.split("Final answer").length - 1, 1);
  assert.equal(text.split("Первое сообщение").length - 1, 1);
});
test("hidden messages and tool messages remain excluded", async () => {
  const json = fixture(); json.mapping.first.message.metadata.is_visually_hidden_from_conversation = true;
  json.mapping.tool = { parent: "first", message: message("TOOL CONTENT", "tool") }; json.mapping.last.parent = "tool";
  const env = exporter(json); env.run("txt");
  const text = await env.downloads[0].blob.text();
  assert.ok(text.includes("Final answer")); assert.ok(!text.includes("Первое сообщение")); assert.ok(!text.includes("TOOL CONTENT"));
});
test("non-Latin titles produce meaningful safe filenames", () => {
  const env = exporter(fixture()); env.run("md");
  assert.match(env.downloads[0].filename, /^обсуждение-проекта-\d{4}-\d{2}-\d{2}\.md$/);
});
test("long multilingual titles are bounded without splitting code points", () => {
  const json = fixture(); json.title = "𐐀".repeat(100) + "/../";
  const env = exporter(json); env.run("txt");
  const name = env.downloads[0].filename;
  assert.equal(Array.from(name.replace(/-\d{4}-\d{2}-\d{2}\.txt$/, "")).length, 40);
  assert.ok(!/[\\/:*?"<>|\u0000-\u001f]/.test(name));
});
test("JSON export preserves the original graph and input remains unchanged", async () => {
  const json = fixture(); const before = JSON.stringify(json);
  const env = exporter(json); env.run("json"); env.run("md");
  assert.deepEqual(JSON.parse(await env.downloads[0].blob.text()), json);
  assert.equal(JSON.stringify(json), before);
});
test("missing conversation and unsupported format do not start downloads", () => {
  assert.equal(exporter(null).run("md"), false);
  const env = exporter(fixture()); assert.equal(env.run("unsupported"), false); assert.equal(env.downloads.length, 0);
});
