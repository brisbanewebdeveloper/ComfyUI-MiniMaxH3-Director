// The Studio is the H3 Director node's face in the graph; "Full screen" lifts the same Studio over the window and back.
import assert from "node:assert/strict";
import { installStudioDom, fixture } from "../regressions/studio_fixture.mjs";
import { openStudio, closeStudio } from "../../../js/ng/h3s_studio.js";

installStudioDom();
// The overlay fixture only ever removed from <body>; here the Studio also sits in a node.
Object.getPrototypeOf(document.body).remove = function () { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((entry) => entry !== this); this.parentNode = null; };
const f = fixture(), host = document.createElement("div");
const studio = openStudio(f.node, f.app, f.api, host);
assert.equal(studio.root.parentNode, host, "the Studio lives in the node, not over the window");
assert.ok(!studio.root.classList.contains("full"));
assert.equal(studio.root.button("Back to graph"), undefined, "in the graph there is nothing to go back to");
assert.equal(studio.root.byClass("h3s-title").length, 0, "the node's own title names it");
assert.ok(studio.root.byClass("h3s-shot").length, "the timeline is there right away");
assert.equal(openStudio(f.node, f.app, f.api, host), studio, "one Studio per node");

// Delete or Backspace on a Studio button must not reach ComfyUI, which would delete the selected node; Ctrl+S may.
const key = (init) => { const event = { ...init, stopped: false, stopPropagation() { this.stopped = true; } }; studio.root.fire("keydown", event); return event.stopped; };
assert.ok(key({ key: "Delete" }) && key({ key: "Backspace" }), "graph shortcuts stay out of the Studio");
assert.ok(!key({ key: "s", ctrlKey: true }), "Ctrl+S still saves the workflow");

studio.root.button("Full screen").onclick();
assert.equal(studio.root.parentNode, document.body, "Full screen moves the same Studio over the window");
assert.ok(studio.root.classList.contains("full"));
assert.equal(studio.root.byClass("h3s-title")[0].innerText, "H3 Director");
let stopped = false;
studio.root.onkeydown({ key: "Escape", target: studio.root, stopPropagation() { stopped = true; } });
assert.ok(stopped && studio.root.parentNode === host && !studio.root.classList.contains("full"), "Esc puts it back into the node");
stopped = false;
studio.root.onkeydown({ key: "Escape", target: studio.root, stopPropagation() { stopped = true; } });
assert.ok(!stopped && studio.root.parentNode === host, "in the graph Esc is left to ComfyUI");

closeStudio(f.node);
assert.equal(host.children.length, 0, "removing the node removes its Studio");
// Nodes saved at the former, smaller size grow once; what lies right of or below them moves along, the rest stays.
{
  const { makeRoom } = await import("../../../js/ng/ng_layout.js");
  const at = (x, y, w = 200, h = 100) => ({ pos: [x, y], size: [w, h] });
  const director = at(0, 0, 1400, 1150), right = at(500, 0), below = at(0, 600), left = at(-400, 0), farBelow = at(2000, 900);
  const around = { pos: [-50, -50], size: [1000, 800] }, aside = { pos: [600, 0], size: [300, 300] };
  makeRoom({ _nodes: [director, right, below, left, farBelow], _groups: [around, aside] }, [[director, [440, 470]]]);
  assert.deepEqual(right.pos, [1460, 0], "right of the old node: moves right by the growth");
  assert.deepEqual(below.pos, [0, 1280], "under the node: moves down");
  assert.deepEqual(left.pos, [-400, 0], "left of it: stays");
  assert.deepEqual(farBelow.pos, [2960, 900], "right of it, even lower: moves right only");
  assert.deepEqual(around.size, [1960, 1480], "a group around the node grows with it");
  assert.deepEqual(aside.pos, [1560, 0]);
  // Two cards in one column (text over image), then the Connector and the Director: the column moves things once.
  const text = at(-1560, 40, 870, 758), image = at(-1560, 470, 750, 829), connector = at(-1140, 40, 560, 400), next = at(-740, 40, 1400, 1150);
  makeRoom({ _nodes: [text, image, connector, next] }, [[text, [400, 390]], [image, [400, 600]], [next, [440, 470]]]);
  assert.deepEqual(connector.pos, [-670, 40], "moved once by the widest card of the column");
  assert.deepEqual(next.pos, [-270, 40]);
  assert.deepEqual(image.pos, [-1560, 838], "the lower card moves below the grown upper one");
  assert.ok(text.pos[0] + text.size[0] <= connector.pos[0], "the grown cards end before the Connector");
}
console.log("h3s embedded ok");
