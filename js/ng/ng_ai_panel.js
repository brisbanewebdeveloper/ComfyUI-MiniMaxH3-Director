// Each AI source has a real execution path; native sources use ComfyUI's queue and loaders.
import { element, values, applyValues,nativeAIFingerprint } from "./ng_widgets.js";
import { control, hideNative, section } from "./ng_editor_fields.js";
import { upstreamNode } from "./ng_read.js";

const { app } = window.comfyAPI.app;

export const SOURCES = [
  { id: "local", title: "Local", hint: "Disk / local server", icon: "&#128421;",
    providers: ["ollama", "lmstudio"],
    address: "Use an installed text encoder or a running Ollama / LM Studio server.",
    note: "Disk models load only during an explicit AI action; ComfyUI manages the device and memory." },
  { id: "api", title: "API", hint: "Online provider", icon: "&#127760;",
    providers: ["custom"],
    address: "Any OpenAI-compatible endpoint. Enter its address below; the key comes from an environment variable.",
    note: "A remote endpoint has no default address, so it is required before a request can work." },
  { id: "clip", title: "CLIP / Encoder", hint: "Connected ComfyUI model", icon: "&#128206;",
    providers: [],
    address: "Connect Load CLIP to this node's CLIP input. Analyze and Auto Direct use native Generate Text.",
    note: "Choose a generative encoder. Image/audio support depends on the loaded model; H3's conditioning encoder stays at the Connector." },
  { id: "custom", title: "Custom", hint: "Compatible adapter", icon: "&#129513;", providers:["custom"],
    address:"Use a custom local or remote OpenAI-compatible adapter, including llama.cpp's server.",
    note:"Set the adapter address and its served model name. Only explicit AI actions call it." },
];

// The existing Director node already talks to these servers, so reuse its real addresses as the
// placeholders: a fresh node then shows the address that actually works. A local server needs no
// key, which is why the key row is hidden for both of them and only offered to a remote endpoint.
export const PROVIDER_HINTS = {
  ollama: { url: "http://127.0.0.1:11434", model: "qwen2.5vl:7b", key: false },
  lmstudio: { url: "http://127.0.0.1:1234", model: "your-loaded-model-name", key: false },
  custom: { url: "http://your-server:port", model: "your-model-name", key: true },
};

export function sourceOf(node) {
  const config = values(node);
  const found = SOURCES.find((entry) => entry.id === config.source);
  return found || SOURCES.find((entry) => entry.providers.includes(config.provider)) || SOURCES[0];
}

function sourceCard(entry, onPick) {
  const button = element("button", "ng-source-card");
  button.type = "button";
  button.dataset.source = entry.id;
  const icon = element("span", "ng-source-icon");
  icon.innerHTML = entry.icon;
  const text = element("span", "ng-source-text");
  text.append(element("strong", "", entry.title), element("small", "", entry.hint));
  button.append(icon, text);
  button.onclick = () => onPick(entry);
  return button;
}

export function buildPanel(node, root, header, widget) {
  // root is height:100%, so measuring it would feed the widget height back into itself and grow
  // without bound. Measure an auto-height wrapper instead.
  const body = element("div", "ng-panel-body");
  const status = element("span", "ng-ai-badge", "Not configured");
  header.append(status);
  root.append(body);

  const sourceSection = section("1. Source");
  const cards = element("div", "ng-source-cards");
  const address = element("small", "ng-muted");
  const note = element("small", "ng-muted");
  sourceSection.append(cards, address, note);
  body.append(sourceSection);

  const identity = section("2. Provider / Model");
  const backendField=control(node,"local_backend","Local source"),diskField=control(node,"local_model","Installed text encoder");
  const typeField=control(node,"local_type","Encoder loader type");
  identity.append(backendField.label,diskField.label,typeField.label);
  const identityRow = element("div", "ng-row");
  const providerField = control(node, "provider", "Provider");
  const modelField = control(node, "model", "Model");
  identityRow.append(providerField.label, modelField.label);
  identity.append(identityRow);
  body.append(identity);

  const settings = section("3. Settings");
  const capabilityRow = element("div", "ng-row");
  const vision = control(node, "vision", "Vision \u00b7 sees images", { boolean: true });
  const audio = control(node, "audio", "Audio \u00b7 input_audio", { boolean: true });
  capabilityRow.append(vision.label, audio.label);
  const tuningRow = element("div", "ng-row");
  const timeout = control(node, "timeout_seconds", "Timeout \u00b7 seconds", { number: true });
  const tokens = control(node, "max_tokens", "Max tokens", { number: true });
  tuningRow.append(timeout.label, tokens.label);
  settings.append(capabilityRow, tuningRow);
  body.append(settings);

  const advanced = element("details", "ng-expert");
  advanced.append(element("summary", "", "Advanced (optional)"));
  const urlField = control(node, "base_url", "Server / API base URL");
  const keepAlive = control(node, "keep_alive", "Keep model loaded \u00b7 seconds", { number: true });
  const keyField = control(node, "api_key_env", "API key environment variable");
  advanced.append(urlField.label, keepAlive.label, keyField.label);
  advanced.append(element("small", "ng-muted",
    "No request runs on connect. Analyze and Auto Direct are the only actions that call the provider, and only when you click them."));
  body.append(advanced);

  const fields = [providerField, modelField, vision, audio, timeout, tokens, urlField, keepAlive, keyField,backendField,diskField,typeField];
  const providerWidget = node.widgets?.find((entry) => entry.name === "provider");

  // The dropdown must only offer what this source really supports, so a wrong provider cannot be
  // picked and then fail at request time.
  function applyProviderChoices(providers) {
    if (!providerWidget) return;
    providerWidget.options = providerWidget.options || {};
    providerWidget.options.values = providers;
    if (!providers.includes(providerWidget.value) && providers.length) {
      providerWidget.value = providers[0];
      providerWidget.callback?.(providerWidget.value);
    }
    const select = providerField.field;
    if (select.tagName !== "SELECT") return;
    select.replaceChildren();
    for (const value of providers) {
      const option = element("option", "", value);
      option.value = value;
      select.append(option);
    }
    providerField.sync();
  }

  function sync() {
    const current = sourceOf(node);
    for (const entry of cards.children) entry.setAttribute("aria-pressed", String(entry.dataset.source === current.id));
    address.textContent = current.address;
    note.textContent = current.note;
    const config = values(node),native=current.id==="clip"||(current.id==="local"&&config.local_backend==="disk");
    identity.hidden = current.id==="clip";
    backendField.label.hidden=current.id!=="local";
    diskField.label.hidden=typeField.label.hidden=!(current.id==="local"&&native);
    identityRow.hidden=native;timeout.label.hidden=false;
    urlField.label.hidden=keepAlive.label.hidden=native;
    if(!native)applyProviderChoices(current.providers);
    // Reuse the addresses the existing Director node already works with, so the field shows the
    // server that actually answers instead of a blank box.
    const hint = PROVIDER_HINTS[config.provider] || { url: "", model: "", key: false };
    if (urlField.field.tagName === "INPUT") urlField.field.placeholder = hint.url;
    if (modelField.field.tagName === "INPUT") modelField.field.placeholder = hint.model;
    // A local server needs no key, so the row would only be one more thing to wonder about.
    keyField.label.hidden = native||!hint.key;
    fields.forEach((field) => field.sync());
    if (current.id==="clip")status.textContent=upstreamNode(node.graph,node.inputs?.find((input)=>input.name==="clip"))?"CLIP connected · not tested":"Connect Load CLIP";
    else if(native)status.textContent=config.local_model?"Selected · loads on action":"Choose encoder";
    else if (!config.model) status.textContent = "Not configured";
    else if (config.provider === "custom" && !config.base_url) status.textContent = "Address needed";
    else status.textContent = "Configured \u00b7 not tested";
    const test=node.properties.ng_ai_test;
    if(native&&test?.fingerprint===nativeAIFingerprint(node))status.textContent=`Tested · ${test.action} / ${test.media}`;
    node.setDirtyCanvas?.(true, true);
  }

  for (const entry of SOURCES) {
    cards.append(sourceCard(entry, (picked) => {
      // The CLIP card has no provider, so it must not overwrite a previously chosen one.
      applyValues(node, { source: picked.id, ...(picked.providers[0] ? { provider: picked.providers[0] } : {}) });
      sync();
      fit(true);
      app.graph?.change();
    }));
  }

  hideNative(node, ["source", "provider", "base_url", "model", "api_key_env", "vision", "audio",
                     "timeout_seconds", "max_tokens", "keep_alive","local_backend","local_model","local_type"]);

  const MIN_HEIGHT = 240;
  function panelHeight() {
    const content=Array.from(body.children).filter((child)=>!child.hidden).reduce((height,child)=>{
      const style=getComputedStyle(child);
      return height+child.offsetHeight+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
    },0);
    return Math.max(MIN_HEIGHT,Math.ceil(content+header.offsetHeight)+32);
  }
  // LiteGraph gives a widget that defines computeSize a fixed height and never hands it the space
  // the node gained, which is why dragging the node down left the content at its old size. A widget
  // that only defines computeLayoutSize is measured against the free space instead, so the panel
  // follows the drag. minHeight keeps the content from being cut off when the node is too small.
  widget.computeSize = undefined;
  widget.computeLayoutSize = () => ({ minHeight: panelHeight(), maxHeight: Number.MAX_SAFE_INTEGER, minWidth: 0 });
  // Grow when the content needs room, but only shrink when the panel itself changed shape. Shrinking
  // unconditionally would fight the user's drag and snap the node back while they resize it.
  function fit(allowShrink = false) {
    const wanted = panelHeight();
    if (wanted > node.size[1] || (allowShrink && wanted < node.size[1] - 2)) node.setSize([node.size[0], wanted]);
    node.setDirtyCanvas?.(true, true);
  }
  advanced.addEventListener("toggle", () => fit(true));
  // The node grew under the pointer, so the panel has to re-read its own height after the drag ends.
  const resized = node.onResize; node.onResize = function (...args) { const result = resized?.apply(this, args);
    queueMicrotask(() => fit()); return result; };
  const observer=new ResizeObserver(() => fit());observer.observe(body);
  const changed=node.onConnectionsChange;node.onConnectionsChange=function(...args){const result=changed?.apply(this,args);queueMicrotask(sync);return result;};
  const tested=()=>sync();document.addEventListener("ng-ai-tested",tested);
  sync();
  fit(true);
  return { sync, fit, dispose(){observer.disconnect();document.removeEventListener("ng-ai-tested",tested);} };
}
