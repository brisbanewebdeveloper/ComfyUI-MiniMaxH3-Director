// The Context card pieces on a minimal DOM: what they show for a state and which action each click triggers.
import assert from "node:assert/strict";
import { installDom } from "./fake_dom.mjs";

installDom();
const parts = await import("../../../js/ng/h3c_parts.js");
const { textBody } = await import("../../../js/ng/h3c_text.js");

function recorder() {
  const calls = [];
  return { calls, actions: new Proxy({}, { get: (_t, name) => (...args) => { calls.push([name, ...args]); } }) };
}
const state = (extra = {}) => ({ media: "image", values: { name: "Alice", image: "alice.png", description: "", preserve: "high", text: "", ...extra.values },
  opts: { preserve: { identity: "high", pose: "low" }, start_s: 0, end_s: 0, video_audio: "ignore" }, content: ["character", "face"], usage: "reference",
  ai: true, busy: false, analyzed: false, mode: "ref2va", files: ["alice.png", "robot.png"], owners: { current: [], choices: [{ id: "bob", name: "Bob" }] },
  suggestion: null, presets: ["Alice_Default"], presetName: "", accent: "#6AA6F8", uses: ["Shot 1"], status: "", els: {},
  textMode: "note", hasAiText: false, build: { block: "global", seconds: 8 }, ...extra });

// What is in it: ticks show the stored roles, a click toggles one; Analyze needs a connected AI.
{
  const { actions, calls } = recorder();
  const view = parts.contentBox(state(), actions);
  const ticks = view.byTag("button").filter((node) => node.classList.contains("h3c-chk"));
  assert.deepEqual(ticks.map((node) => node.attributes["aria-pressed"]), ["true", "true", "false", "false", "false", "false"]);
  ticks[2].onclick();
  assert.deepEqual(calls.at(-1), ["toggleContent", "outfit"]);
  assert.equal(parts.contentBox(state({ ai: false }), actions).button("✦ Analyze").disabled, true);
}

// Use as: one choice, and the Director's mode turns a useless choice into a warning.
{
  const { actions, calls } = recorder();
  const view = parts.usageBox(state(), actions);
  view.button("Last frame").onclick();
  assert.deepEqual(calls.at(-1), ["pickUsage", "last_frame"]);
  assert.ok(!view.byClass("h3c-warn").length);
  assert.ok(parts.usageBox(state({ mode: "fl2va" }), actions).byClass("h3c-warn").length, "a reference in FL2VA is flagged");
}

// Keep in the video: stored level is highlighted; background has its own words.
{
  const { actions, calls } = recorder();
  const view = parts.keepBox(state(), actions);
  const on = view.find((node) => node.tagName === "BUTTON" && node.classList.contains("on")).map((node) => node.attributes["aria-label"]);
  assert.deepEqual(on, ["Identity high", "Outfit high", "Pose low", "Background ignore"]);
  view.find((node) => node.attributes["aria-label"] === "Background keep")[0].onclick();
  assert.deepEqual(calls.at(-1), ["setKeep", "background", "keep"]);
}

// Belongs to, the AI suggestion and the usage line.
{
  const { actions, calls } = recorder();
  const owner = parts.ownerBox(state(), actions, "Independent.");
  owner.byTag("select")[0].onchange({ target: { value: "bob" } });
  assert.deepEqual(calls.at(-1), ["setOwner", "bob"]);
  assert.ok(owner.innerText.includes("Independent."));
  assert.ok(parts.ownerBox(state({ owners: { current: ["bob"], choices: [{ id: "bob", name: "Bob" }] } }), actions, "").innerText.includes("Presented together with Bob."));
  assert.equal(parts.suggestionBox(state(), actions), null);
  const suggestion = parts.suggestionBox(state({ suggestion: { fields: { content: "character", description: "A mage." }, why: "" } }), actions);
  assert.ok(suggestion.innerText.includes("Description: A mage."));
  suggestion.button("Accept").onclick();
  assert.deepEqual(calls.at(-1), ["accept"]);
  assert.ok(parts.usesLine(state()).innerText.includes("In the Studio: Shot 1"));
  assert.equal(parts.presetRow(state(), actions).button("Save").disabled, true, "a preset needs a name");
}

// Text: the AI view is only offered once a prompt exists; in it the note tools are off.
{
  const { actions, calls } = recorder();
  const S = state({ media: "text", usage: "style", values: { name: "Rules", text: "Slow camera." } });
  const [main] = textBody(S, actions);
  assert.equal(main.button("AI prompt").disabled, true);
  main.button("+ Character").onclick();
  assert.deepEqual(calls.at(-1), ["insert", "character"]);
  main.byTag("textarea")[0].oninput({ target: { value: "Slow camera, no cuts." } });
  assert.deepEqual(calls.at(-1), ["setNote", "Slow camera, no cuts."]);
  const [aiView] = textBody(state({ media: "text", usage: "style", textMode: "ai", hasAiText: true, values: { text: "visual_style: slow" } }), actions);
  const area = aiView.byTag("textarea")[0];
  assert.ok(area.readOnly === true || "readOnly" in area.attributes, "the AI prompt is read-only");
  assert.equal(aiView.button("+ Character").disabled, true);
}

console.log("h3c views ok");
