// The H3 Director in the graph: small, with the Prompt, the main settings, a mini timeline and the way into the Studio.
import { h, icon } from "./h3s_dom.js";
import { ensureStudioStyle } from "./h3s_style.js";
import { readProject, writeProject, fmt, sorted, partColor } from "./h3s_model.js";
import { isAuto } from "./h3s_canvas.js";
import { openStudio, closeStudio } from "./h3s_studio.js";
import { values, applyValues, request } from "./ng_widgets.js";
import { readPayload, readContexts, connectedProvider } from "./ng_read.js";
import { renameReferences } from "./ng_references.js";
import { projectRenderIds } from "./ng_graph.js";
import { attachProgress } from "./ng_studio_progress.js";
import { hideNative } from "./ng_editor_fields.js";

const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;
const nodes = new Set();
const MODES = { fl2va: "FL2VA", ref2va: "Ref2VA", auto: "Auto" };
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
  if (!project.error && project.shots.length) {
    const shots = project.shots.map((shot) => ({ ...shot, text: renameReferences(shot.text, previous, entries) }));
    if (shots.some((shot, index) => shot.text !== project.shots[index].text)) changes.shots = writeProject({ ...project, shots });
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
  const root = h("div", { class: "h3n" });
  const prompt = h("textarea", { rows: 3, placeholder: "Beschreibe dein Video …", "aria-label": "Prompt",
    oninput: (event) => { applyValues(node, { idea: event.target.value }); node.graph?.change?.(); } });
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } });
  const status = h("span", { style: { fontSize: "12px", color: "#B9D8FF" } }), preview = h("img", { hidden: true, alt: "Live-Vorschau",
    style: { maxWidth: "100%", borderRadius: "6px" } });
  const progress = attachProgress(node, api, status, preview, () => projectRenderIds(node));
  root.append(h("span", { style: { fontSize: "12px", color: "#9AA4B5" } }, "Prompt"), prompt, body,
    h("button", { class: "h3n-open", onclick: () => openStudio(node, app, api) }, icon("expand"), "Studio öffnen"), status, preview);
  hideNative(node, (node.widgets || []).map((widget) => widget.name));
  const dom = node.addDOMWidget("h3_director", "h3_director", root, { serialize: false, hideOnZoom: false });
  dom.computeSize = undefined;
  dom.computeLayoutSize = () => ({ minHeight: 330, maxHeight: Number.MAX_SAFE_INTEGER, minWidth: 0 });
  let plan = null, timer = null, serial = 0, removed = false;

  function render() {
    const v = values(node), project = readProject(v.shots || ""), seconds = Number(v.project_seconds) || 1;
    if (document.activeElement !== prompt) prompt.value = v.idea || "";
    const tile = (label, value) => h("div", { class: "h3n-tile" }, h("div", { style: { fontSize: "11px", color: "#9AA4B5" } }, label), h("div", { style: { fontWeight: 600 } }, value));
    const size = isAuto(v.width, v.height) ? (plan ? `${plan.width}×${plan.height}` : "aus Bild") : `${v.width}×${v.height}`;
    const shots = sorted(project.shots).map((shot, index) => h("span", { style: { left: `${shot.start / seconds * 100}%`, width: `${(shot.end - shot.start) / seconds * 100}%` },
      title: shot.text }, `Shot ${index + 1}`));
    const parts = (plan?.chunks || []).map((chunk) => h("span", { style: { left: `${chunk.start_s / Math.max(seconds, plan.total_s) * 100}%`,
      width: `calc(${(chunk.end_s - chunk.start_s) / Math.max(seconds, plan.total_s) * 100}% - 2px)`, background: partColor(chunk.index)[0] } }));
    const ai = Boolean(connectedProvider(node)), issues = plan?.issues?.length || 0;
    body.replaceChildren(...[
      h("div", { class: "h3n-tiles" }, tile("Dauer", fmt(Number(v.project_seconds))), tile("Render-Teil", Number(v.chunk_seconds) ? fmt(Number(v.chunk_seconds)) : "Auto"), tile("Auflösung", size)),
      h("span", { style: { fontSize: "12px", color: "#9AA4B5" } }, project.error ? "Shot-Daten fehlerhaft, im Studio prüfen"
        : `${project.shots.length || "Keine"} Shots · ${plan ? plan.chunks.length : "?"} Render-Teil${plan?.chunks.length === 1 ? "" : "e"} · ${project.lanes.length} Tonspur${project.lanes.length === 1 ? "" : "en"}`),
      h("div", { class: "h3n-mini" }, shots.length ? shots : h("span", { style: { left: "0", width: "100%", background: "transparent", border: 0, color: "#7F8A9C" } }, "Der Prompt trägt das ganze Video")),
      h("div", { class: "h3n-parts" }, parts),
      h("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12px", color: "#9AA4B5" } },
        h("span", {}, `${MODES[v.mode] || v.mode}${v.turbo ? " · Turbo" : ""} · 24 FPS · ${v.steps} Steps`),
        h("span", { style: { color: ai ? "#A9E8C2" : "#9AA4B5" } }, ai ? "KI verbunden" : "KI aus")),
      issues ? h("span", { style: { fontSize: "12px", color: "#F2B98A" } }, `${issues} Hinweis${issues === 1 ? "" : "e"} · im Studio unter „Prompt ansehen“`) : null].filter(Boolean));
  }
  function schedule() {
    clearTimeout(timer); const mine = ++serial;
    followRenames(node); render();
    timer = setTimeout(async () => {
      try { plan = await request(api, "/ng/plan", readPayload(node)); } catch { plan = null; }
      if (!removed && mine === serial) render();
    }, 300);
  }
  for (const widget of node.widgets || []) {
    if (widget === dom) continue;
    const original = widget.callback;
    widget.callback = function (...args) { const result = original?.apply(this, args); schedule(); return result; };
  }
  const connected = node.onConnectionsChange;
  node.onConnectionsChange = function (...args) { const result = connected?.apply(this, args); schedule(); return result; };
  const configured = node.onConfigure;
  node.onConfigure = function (...args) {
    const result = configured?.apply(this, args);
    for (const key of ["ng_view_mode", "ng_selected_shot_id"]) delete node.properties[key];
    repairLaterWidgets(node);
    schedule(); return result;
  };
  const gone = node.onRemoved;
  node.onRemoved = function (...args) {
    removed = true; clearTimeout(timer); nodes.delete(schedule); progress.dispose(); closeStudio(node); return gone?.apply(this, args);
  };
  node.setSize([440, 470]);
  nodes.add(schedule); schedule();
}

app.registerExtension({
  name: "mmxd.ng.director_studio",
  nodeCreated(node) { if (["NGH3Director", "NGDirectorStudio"].includes(node.comfyClass)) attach(node); },
  loadedGraphNode() { nodes.forEach((schedule) => schedule()); },
});
document.addEventListener("ng-context-changed", () => nodes.forEach((schedule) => schedule()));
