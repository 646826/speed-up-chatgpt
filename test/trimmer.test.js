// Speed Up ChatGPT — node test for trimConversation (no frameworks).
// Run: node test/trimmer.test.js
// Prints PASS/FAIL; exits with code 1 on failure.

"use strict";

const { trimConversation } = require("../content/main-interceptor.js");

let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log("ok   - " + name);
  } else {
    failures++;
    console.error("FAIL - " + name);
  }
}

function eq(name, actual, expected) {
  check(name + " (expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual) + ")",
    actual === expected);
}

function deepEq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected));
}

// ---------------------------------------------------------------------------
// Fixture: linear chain of 30 messages (m1..m30) under a root, plus:
//  - a side branch off m10 (s1 -> s2), NOT on the active path
//  - a hidden node h1 between m20 and m21 (on the active path, invisible)
// Active path: root -> m1..m20 -> h1 -> m21..m30  (current_node = m30)
// Visible messages on the active path: 30 (h1 excluded).
// ---------------------------------------------------------------------------
function buildConversation() {
  const mapping = {};
  const rootId = "client-created-root";
  mapping[rootId] = { id: rootId, message: null, parent: null, children: [] };

  function addMessage(id, parentId, role, text, hidden) {
    mapping[id] = {
      id: id,
      message: {
        id: "msg-" + id,
        author: { role: role },
        content: { content_type: "text", parts: [text] },
        create_time: 1700000000,
        metadata: hidden ? { is_visually_hidden_from_conversation: true } : {},
      },
      parent: parentId,
      children: [],
    };
    mapping[parentId].children.push(id);
  }

  let prev = rootId;
  for (let i = 1; i <= 30; i++) {
    const id = "m" + i;
    const role = i % 2 === 1 ? "user" : "assistant";
    addMessage(id, prev, role, "message " + i, false);
    if (i === 10) {
      // Side branch (e.g. a regeneration) hanging off the active path.
      addMessage("s1", "m10", "assistant", "side branch 1", false);
      addMessage("s2", "s1", "user", "side branch 2", false);
    }
    if (i === 20) {
      // Visually hidden node in the middle of the active path.
      addMessage("h1", "m20", "system", "hidden system note", true);
      prev = "h1";
      continue;
    }
    prev = id;
  }

  return { title: "Test chat", mapping: mapping, current_node: "m30" };
}

// --- Case 1: total <= limit -> original object returned unchanged ----------
(function () {
  const conv = buildConversation();
  const before = JSON.stringify(conv);
  const res = trimConversation(conv, 50);

  check("total<=limit: returns the same object reference", res.json === conv);
  eq("total<=limit: stats.total", res.stats.total, 30);
  eq("total<=limit: stats.kept", res.stats.kept, 30);
  eq("total<=limit: stats.hidden", res.stats.hidden, 0);
  eq("total<=limit: stats.hasOlderMessages", res.stats.hasOlderMessages, false);
  check("total<=limit: input not mutated", JSON.stringify(conv) === before);
})();

// --- Case 2: total > limit -> trimmed correctly ----------------------------
(function () {
  const conv = buildConversation();
  const before = JSON.stringify(conv);
  const res = trimConversation(conv, 15);
  const out = res.json;
  const rootId = "client-created-root";

  // Stats
  eq("trim: stats.total", res.stats.total, 30);
  eq("trim: stats.kept", res.stats.kept, 15);
  eq("trim: stats.hidden", res.stats.hidden, 15);
  eq("trim: stats.hasOlderMessages", res.stats.hasOlderMessages, true);

  // Structure: root + exactly the last 15 visible messages (m16..m30)
  const ids = Object.keys(out.mapping).sort();
  const expectedIds = [rootId].concat(
    Array.from({ length: 15 }, (_, k) => "m" + (16 + k))
  ).sort();
  deepEq("trim: new mapping contains root + m16..m30 only", ids, expectedIds);

  // Root preserved and re-linked to the oldest kept node
  check("trim: root preserved", !!out.mapping[rootId]);
  check("trim: root.message still null", out.mapping[rootId].message === null);
  check("trim: root.parent still null", out.mapping[rootId].parent === null);
  deepEq("trim: root.children", out.mapping[rootId].children, ["m16"]);

  // parent/children consistency along the kept chain
  eq("trim: m16.parent is root", out.mapping["m16"].parent, rootId);
  eq("trim: m17.parent is m16", out.mapping["m17"].parent, "m16");
  deepEq("trim: m16.children", out.mapping["m16"].children, ["m17"]);
  eq("trim: m21.parent is m20 (hidden node skipped)", out.mapping["m21"].parent, "m20");
  deepEq("trim: m20.children", out.mapping["m20"].children, ["m21"]);
  deepEq("trim: last kept node has no children", out.mapping["m30"].children, []);
  let chainOk = true;
  for (let i = 16; i < 30; i++) {
    const cur = out.mapping["m" + i];
    const nxt = out.mapping["m" + (i + 1)];
    if (!cur || !nxt || cur.children[0] !== nxt.id || nxt.parent !== cur.id) chainOk = false;
  }
  check("trim: parent/children consistent for the whole kept chain", chainOk);

  // current_node preserved and present
  eq("trim: current_node preserved", out.current_node, "m30");
  check("trim: current_node present in new mapping", !!out.mapping[out.current_node]);

  // Other top-level fields preserved
  eq("trim: title preserved", out.title, "Test chat");

  // Untouched node fields preserved (deep copies, not references)
  eq("trim: kept node text preserved",
    out.mapping["m25"].message.content.parts[0], "message 25");
  check("trim: kept nodes are copies, not references",
    out.mapping["m25"] !== conv.mapping["m25"] &&
    out.mapping["m25"].message !== conv.mapping["m25"].message);

  // Hidden and side-branch nodes excluded
  check("trim: hidden node h1 excluded", !out.mapping["h1"]);
  check("trim: side branch s1 excluded", !out.mapping["s1"]);
  check("trim: side branch s2 excluded", !out.mapping["s2"]);
  check("trim: old active node m15 excluded", !out.mapping["m15"]);

  // Input not mutated (deep snapshot + spot checks)
  check("trim: input not mutated (deep snapshot)", JSON.stringify(conv) === before);
  deepEq("trim: original root.children untouched", conv.mapping[rootId].children, ["m1"]);
  eq("trim: original m16.parent untouched", conv.mapping["m16"].parent, "m15");
  check("trim: result is a new top-level object", out !== conv);
  check("trim: mapping is a new object", out.mapping !== conv.mapping);
})();

// --- Case 3: branching — only active-branch nodes are kept -----------------
(function () {
  const conv = buildConversation();
  const res = trimConversation(conv, 5);
  const ids = Object.keys(res.json.mapping);
  const activeOnly = ids.every((id) =>
    id === "client-created-root" || /^m(2[6-9]|30)$/.test(id));
  check("branching: kept nodes come only from the active branch", activeOnly);
  check("branching: no side-branch nodes kept", !ids.includes("s1") && !ids.includes("s2"));
  eq("branching: stats.kept", res.stats.kept, 5);
  eq("branching: stats.hidden", res.stats.hidden, 25);
})();

// --- Case 4: cycle protection — must terminate ------------------------------
(function () {
  const cyclic = {
    title: "cyclic",
    current_node: "a",
    mapping: {
      a: { id: "a", message: { author: { role: "user" }, content: { parts: ["A"] }, metadata: {} }, parent: "b", children: ["b"] },
      b: { id: "b", message: { author: { role: "user" }, content: { parts: ["B"] }, metadata: {} }, parent: "a", children: ["a"] },
    },
  };
  const res = trimConversation(cyclic, 1);
  check("cycle: terminates and returns stats", res && res.stats && typeof res.stats.total === "number");
  eq("cycle: stats.kept", res.stats.kept, 1);
})();

// --- Case 5: defensive input ------------------------------------------------
(function () {
  const res = trimConversation(null, 10);
  check("null input: does not throw, zero stats", res.stats.total === 0 && res.stats.kept === 0);
  const res2 = trimConversation({ mapping: {}, current_node: null }, 10);
  check("empty mapping: zero stats, json unchanged",
    res2.stats.total === 0 && res2.json.mapping && Object.keys(res2.json.mapping).length === 0);
})();

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.log("\nFAIL — " + failures + " check(s) failed");
  process.exit(1);
}
console.log("\nPASS — all checks passed");
