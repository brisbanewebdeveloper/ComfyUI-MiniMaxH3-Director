// Context previews and local preset controls. File bytes and provider keys never become widget values.
import { ensureStyle } from "./ng_style.js";
import { values, applyValues, element, request, newContextId } from "./ng_widgets.js";
import { attachAnalysis } from "./ng_analysis.js";
import { FAMILY } from "./ng_context.js";

const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;
const MEDIA = { NGContextImage: "image", NGContextVideo: "video", NGContextAudio: "audio", NGContextText: "text" };

function drawPreview(root, data) {
  root.replaceChildren();
  if (data.thumbnail) {
    const image = element("img", "ng-thumbnail");
    image.src = data.thumbnail;
    image.alt = "Context preview";
    root.append(image);
  }
  if (data.peaks) {
    const canvas = element("canvas", "ng-waveform");
    canvas.width = 320; canvas.height = 48;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#b294db";
    data.peaks.forEach((peak, i) => ctx.fillRect(i * 4, 24 - peak * 23, 2, Math.max(1, peak * 46)));
    root.append(canvas);
    root.append(element("small", "ng-dim", `First ${data.sampled_seconds} s`));
  }
}

function attach(node, media) {
  ensureStyle();
  node.properties ||= {};
  const identity = node.widgets?.find((w) => w.name === "context_id");
  if (identity && !identity.value) identity.value = newContextId();
  const root = element("div", "ng-card");
  const preview = element("div", "ng-media-preview");
  const tools = element("div", "ng-tools");
  const name = element("input");
  name.placeholder = "Preset name"; name.setAttribute("aria-label", "Preset name");
  name.value = node.properties.ng_preset_name || "";
  const choices = element("select");
  choices.setAttribute("aria-label", "Context presets");
  const status = element("div", "ng-status");
  const save = element("button", "", "Save preset");
  const load = element("button", "", "Load preset");
  const reload = element("button", "", "Refresh presets");
  tools.append(name, save, choices, load, reload);
  root.append(preview, tools, status);
  const state = { serial: 0, timer: null, removed: false };
  const report = (error) => { status.textContent = error.message || String(error); };
  async function refreshPresets() {
    const data = await request(api, "/ng/presets?media=" + media);
    choices.replaceChildren();
    for (const label of data.names) {
      const option = element("option", "", label); option.value = label; choices.append(option);
    }
    load.disabled = !data.names.length;
  }
  save.onclick = async () => {
    try {
      const data = await request(api, "/ng/presets", { media, name: name.value, widgets: values(node) });
      node.properties.ng_preset_name = data.name;
      await refreshPresets(); choices.value = data.name;
      status.textContent = `Saved ${data.name}. Saving the same name replaces that preset.`;
    } catch (error) { report(error); }
  };
  load.onclick = async () => {
    try {
      const data = await request(api, "/ng/preset?" + new URLSearchParams({ media, name: choices.value }));
      applyValues(node, data.widgets); name.value = choices.value;
      node.properties.ng_preset_name = choices.value;
      status.textContent = `Loaded ${choices.value}.`;
    } catch (error) { report(error); }
  };
  reload.onclick = () => refreshPresets().catch(report);
  async function update() {
    const serial = ++state.serial;
    const current = values(node);
    node.color = /^#[0-9a-f]{6}$/i.test(current.color) ? current.color : FAMILY[node.comfyClass].color;
    if (media === "text") { preview.textContent = current.text || "Text context"; return; }
    if (!current[media]) { preview.textContent = "Upload a file to see its preview."; return; }
    try {
      const data = await request(api, "/ng/media?" + new URLSearchParams({ media, source: current[media] }));
      if (!state.removed && serial === state.serial) drawPreview(preview, data);
    } catch (error) { if (!state.removed && serial === state.serial) preview.textContent = error.message; }
  }
  function schedule() {
    clearTimeout(state.timer); state.serial++;
    state.timer = setTimeout(update, 350);
  }
  for (const widget of node.widgets || []) {
    const original = widget.callback;
    widget.callback = function (...args) { const result = original?.apply(this, args); schedule(); return result; };
  }
  const widget = node.addDOMWidget("ng_context_card", "ng_context_card", root, { serialize: false });
  widget.computeSize = (width) => [width, 240];
  attachAnalysis(node, media, root, status);
  const configured = node.onConfigure;
  node.onConfigure = function (...args) {
    const result = configured?.apply(this, args);
    if (identity && !identity.value) identity.value = newContextId();
    name.value = node.properties.ng_preset_name || "";
    schedule(); return result;
  };
  const removed = node.onRemoved;
  node.onRemoved = function (...args) { state.removed = true; state.serial++; clearTimeout(state.timer); return removed?.apply(this, args); };
  refreshPresets().catch(report); schedule();
}

app.registerExtension({
  name: "mmxd.ng.context_cards",
  nodeCreated(node) { if (MEDIA[node.comfyClass]) attach(node, MEDIA[node.comfyClass]); },
});
