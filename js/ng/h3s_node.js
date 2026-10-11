// The H3 Director in the graph is the Studio itself: the node's face is the whole Studio, as tall as its content.
// "Full screen" in its header lifts the same Studio over the window; there is no second, compact view.
import { h } from "./h3s_dom.js";
import { ensureStudioStyle } from "./h3s_style.js";
import { readProject, writeProject } from "./h3s_model.js";
import { openStudio, closeStudio } from "./h3s_studio.js";
import { values, applyValues } from "./ng_widgets.js";
import { readContexts } from "./ng_read.js";
import { renameReferences } from "./ng_references.js";
import { hideNative } from "./ng_editor_fields.js";
import { noteGrowth } from "./ng_layout.js";

const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;
const nodes = new Map(); // follow renames -> full refresh, per Director node
// Below this width the Studio stacks its side panel under the timeline; the default leaves room for both side by side.
const MIN_WIDTH = 900, WIDTH = 1400, HEIGHT = 1150;
// Widgets added after the first NG workflows were saved. Those workflows carry one empty trailing value from the former
// in-node editor, which lands on the first new widget; anything that is not a valid value falls back to the default.
const LATER = { turbo: false, turbo_lora_fl2va: "none", turbo_lora_ref2va: "none", resize_method: "crop", ref_image_size: "match" };

export function repairLaterWidgets(node) {
  for (const widget of node.widgets || []) {
    if (!(widget.name in LATER)) continue;
    const valid = widget.name === "turbo" ? typeof widget.value === "boolean" : (widget.options?.values || []).includes(widget.value);
    if (!valid) widget.value = LATER[widget.name];
  }
}

// A renamed Context keeps its @Name mentions in the Prompt and in every shot; the audio lanes travel along untouched.
function followRenames(node) {
  const previous = node.properties.ng_context_names || {}, entries = readContexts(node), now = values(node), changes = {};
  const idea = renameReferences(now.idea || "", previous, entries);
  if (idea !== (now.idea || "")) changes.idea = idea;
  const project = readProject(now.shots || "");
  if (!project.error && !(now.shots || "").trimStart().startsWith("{")) {
    const text = renameReferences(now.shots || "", previous, entries);
    if (text !== (now.shots || "")) changes.shots = text;
  } else if (!project.error) {
    const rename = (text) => renameReferences(text, previous, entries);
    const look = rename(project.look);
    const partPrompts = project.partPrompts.map((part) => ({ ...part, text: rename(part.text) }));
    const shots = project.shots.map((shot) => ({ ...shot, text: rename(shot.text),
      spoken: shot.spoken.map((line) => typeof line.text === "string" ? { ...line, text: rename(line.text) } : line) }));
    const changed = look !== project.look || partPrompts.some((part, index) => part.text !== project.partPrompts[index].text)
      || shots.some((shot, index) => shot.text !== project.shots[index].text
        || shot.spoken.some((line, at) => line.text !== project.shots[index].spoken[at].text));
    if (changed) changes.shots = writeProject({ ...project, shots, look, partPrompts });
  }
  node.properties.ng_context_names = Object.fromEntries(entries.filter((entry) => entry.widgets.context_id && entry.widgets.name)
    .map((entry) => [entry.widgets.context_id, entry.widgets.name]));
  if (Object.keys(changes).length) applyValues(node, changes);
}

function attach(node) {
  ensureStudioStyle();
  node.properties ||= {};
  for (const key of ["ng_view_mode", "ng_selected_shot_id"]) delete node.properties[key];
  node.color = "#172a48"; node.bgcolor = "#101a2c";
  const host = h("div", { class: "h3s-host" });
  hideNative(node, (node.widgets || []).map((widget) => widget.name));
  const dom = node.addDOMWidget("h3_director", "h3_director", host, { serialize: false, hideOnZoom: false });
  // The node is as tall as its Studio, so the DOM never spills over the nodes below it. ComfyUI hides DOM widgets of
  // nodes outside the view; a hidden Studio measures 0, so only a visible one is measured, again whenever it resizes.
  let measured = 900, removed = false;
  dom.computeSize = undefined;
  dom.computeLayoutSize = () => ({ minHeight: measured, maxHeight: measured, minWidth: MIN_WIDTH - 20 });
  const studio = openStudio(node, app, api, host);
  function fit() {
    requestAnimationFrame(() => {
      if (removed || !host.isConnected || studio.root.parentNode !== host) return;
      const height = studio.root.scrollHeight;
      if (height < 200) return;
      measured = Math.ceil(height) + 8;
      const size = node.computeSize?.() || [WIDTH, measured], width = Math.max(node.size?.[0] || 0, MIN_WIDTH);
      if (!node.size || Math.abs(node.size[1] - size[1]) > 2 || node.size[0] < MIN_WIDTH) node.setSize([width, size[1]]);
      node.setDirtyCanvas?.(true, true);
    });
  }
  const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit()) : null;
  watcher?.observe(studio.root);
  // The Studio writes the widgets itself and hears outside changes on its own; the node keeps @Name mentions in step.
  const follow = () => followRenames(node);
  const refresh = () => { followRenames(node); studio.refresh(); fit(); };
  for (const widget of node.widgets || []) {
    if (widget === dom) continue;
    const original = widget.callback;
    widget.callback = function (...args) { const result = original?.apply(this, args); follow(); return result; };
  }
  const connected = node.onConnectionsChange;
  node.onConnectionsChange = function (...args) { const result = connected?.apply(this, args); refresh(); return result; };
  const configured = node.onConfigure;
  node.onConfigure = function (...args) {
    const result = configured?.apply(this, args);
    for (const key of ["ng_view_mode", "ng_selected_shot_id"]) delete node.properties[key];
    repairLaterWidgets(node);
    // Saved by the former compact node: the Studio needs the room once, and the nodes around it move along.
    if (node.size?.[0] < MIN_WIDTH) { noteGrowth(node, [...node.size]); node.setSize([WIDTH, Math.max(node.size[1], HEIGHT)]); }
    refresh(); return result;
  };
  const gone = node.onRemoved;
  node.onRemoved = function (...args) {
    removed = true; watcher?.disconnect(); nodes.delete(follow); closeStudio(node); return gone?.apply(this, args);
  };
  node.setSize([WIDTH, measured]);
  nodes.set(follow, refresh); follow();
}

app.registerExtension({
  name: "mmxd.ng.director_studio",
  nodeCreated(node) { if (["NGH3Director", "NGDirectorStudio"].includes(node.comfyClass)) attach(node); },
  loadedGraphNode() { nodes.forEach((refresh) => refresh()); },
});
document.addEventListener("ng-context-changed", () => nodes.forEach((_refresh, follow) => follow()));
