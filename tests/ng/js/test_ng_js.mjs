// Tests for the NG frontend modules that have logic: reading widgets and wires, and rendering a plan.
// Run: node tests/ng/js/test_ng_js.mjs   (also called by tests/ng/run_tests.py)
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..", "..", "js", "ng");
const load = (name) => import(pathToFileURL(path.join(root, name)).href);

class FakeElement {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ""; this.textContent = ""; this.style = {}; this.title = ""; this.dataset = {}; this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  text() { return [this.textContent, ...this.children.map((c) => c.text())].join(" ").trim(); }
  find(className) { return [this, ...this.children.flatMap((c) => c.all?.() ?? [])].filter((n) => n.className.split(" ").includes(className)); }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
}
globalThis.document = { createElement: (tag) => new FakeElement(tag), dispatchEvent: () => {} };
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };

const { readContexts, readPayload, isContextNode } = await load("ng_read.js");
const { renderPlan } = await load("ng_view.js");

function node(comfyClass, widgets = {}, inputs = [], graph = null) {
  return { comfyClass, widgets: Object.entries(widgets).map(([name, value]) => ({ name, value })), inputs, graph };
}

// --- reading -----------------------------------------------------------------
{
  const alice = node("NGContextImage", { name: "Alice", content: "character" });
  const voice = node("NGContextAudio", { name: "Voice", speaker: "Alice" });
  const other = node("KSampler", { seed: 1 });
  const nodes = { 1: alice, 2: voice, 3: other };
  const links = { 10: { origin_id: 1 }, 11: { origin_id: 2 }, 12: { origin_id: 3 } };
  const graph = { links, getNodeById: (id) => nodes[id] };
  const director = node("NGDirector", { idea: "x", project_seconds: 30 },
    [{ name: "prepend_text", link: null }, { name: "contexts.context_0", link: 10 }, { name: "contexts.context_1", link: 11 },
     { name: "contexts.context_2", link: 12 }, { name: "contexts.context_3", link: null }], graph);

  assert.equal(isContextNode(alice), true);
  assert.equal(isContextNode(other), false);
  const contexts = readContexts(director);
  assert.deepEqual(contexts.map((c) => c.media), ["image", "audio"], "only NG context nodes count, in socket order");
  assert.equal(contexts[0].widgets.name, "Alice");
  assert.deepEqual(readPayload(director).director, { idea: "x", project_seconds: 30 });
}

// --- rendering ---------------------------------------------------------------
{
  const root = new FakeElement("div");
  renderPlan(root, null);
  assert.match(root.text(), /planning/);

  renderPlan(root, { ok: false, error: "project_seconds: must be at least 0.1" });
  assert.match(root.text(), /must be at least 0.1/);
  assert.equal(root.find("ng-error").length, 1);

  const chunk = (index, start, end, head) => ({ index, start_s: start, end_s: end, delivered_frames: Math.round((end - start) * 24), sampled_frames: 260,
    head_frames: head, mode: "ref2va", prompt: `prompt ${index}`, refs: [{ kind: "picture", name: "Alice" }, { kind: "audio", name: "Alice voice" }] });
  const data = { ok: true, total_s: 20, total_frames: 480, mode: "ref2va", chunks: [chunk(0, 0, 10, 0), chunk(1, 10, 20, 22)],
    issues: [{ text: "late", ref: "shot 2" }, { text: "global", ref: "" }] };
  renderPlan(root, data);
  const text = root.text();
  assert.match(text, /2 chunks/);
  assert.match(text, /20\.00 s \(480 frames\)/);
  assert.match(text, /shot 2: late/);
  assert.match(text, /global/);
  assert.equal(root.find("ng-seg").length, 2, "one timeline segment per chunk");
  assert.match(text, /chunk 2 +10\.00 s - 20\.00 s/);
  assert.match(text, /sampled 260, head 22/);
  assert.match(text, /prompt 1/);
  assert.match(text, /picture: Alice +· +audio: Alice voice/);

  renderPlan(root, { ...data, chunks: [chunk(0, 0, 8, 0)], issues: [] });
  assert.match(root.text(), /1 chunk\b/);
  assert.doesNotMatch(root.text(), /Notes/);
}

// Edits from presets notify callbacks, and presentation mode survives a workflow reload without editing render inputs.
{
  const { applyValues } = await load("ng_widgets.js");
  let calls = 0;
  const card = { widgets: [{ name: "description", value: "old", callback: () => calls++ }, { name: "usage", value: "lock" }] };
  applyValues(card, { description: "new", provider_key: "ignored" });
  assert.equal(card.widgets[0].value, "new");
  assert.equal(card.widgets[1].value, "lock");
  assert.equal(calls, 1);
  const { attachModes } = await load("ng_modes.js");
  const node = { properties: { ng_view_mode: "expert" } };
  const container = new FakeElement("div"), plan = new FakeElement("div");
  attachModes(node, container, plan);
  assert.equal(plan.dataset.mode, "expert");
  const buttons = container.children[0].children;
  buttons[0].onclick();
  assert.equal(plan.dataset.mode, "simple");
  assert.equal(buttons[0].attributes["aria-pressed"], "true");
  node.properties.ng_view_mode = "guided";
  node.onConfigure();
  assert.equal(plan.dataset.mode, "guided");
}

console.log("ng js: all checks passed");
