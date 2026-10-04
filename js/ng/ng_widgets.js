// Shared widget reads and edits, also used by presets so edits notify the plan panel.
export function newContextId(source = typeof crypto === "undefined" ? null : crypto) {
  // Identity only, never a credential. getRandomValues also works on ordinary LAN HTTP pages.
  const bytes = new Uint8Array(16);
  if (source?.getRandomValues) source.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return "ctx_" + Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function values(node) {
  return Object.fromEntries((node.widgets || []).filter((w) => w.name).map((w) => [w.name, w.value]));
}

export function analysisFingerprint(media,widgets) {
  return JSON.stringify([widgets[media],widgets.description,widgets.content_roles||widgets.content]);
}

export function nativeAIFingerprint(node) {
  const port=node.inputs?.find((input)=>input.name==="clip"),link=node.graph?.links?.[port?.link];
  const encoder=link&&node.graph.getNodeById(link.origin_id);
  return JSON.stringify([values(node),encoder?.id,encoder?values(encoder):null]);
}

// Edits made from a panel do not pass ComfyUI's own input events, so the workflow would not notice them:
// no unsaved mark, no undo step and the browser restore keeps the old graph. Ask the change tracker once they settle.
let tracking = null;
function noteChange() {
  clearTimeout(tracking);
  tracking = setTimeout(() => globalThis.window?.comfyAPI?.app?.app?.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(), 300);
}

export function applyValues(node, changes) {
  for (const widget of node.widgets || []) {
    if (!(widget.name in changes)) continue;
    widget.value = changes[widget.name];
    widget.callback?.(widget.value);
  }
  node.setDirtyCanvas?.(true, true);
  document.dispatchEvent(new CustomEvent("ng-context-changed"));
  noteChange();
}

// An AI Loader address that is no HTTP(S) URL (left over or shifted in an older workflow) is cleared, so the provider's own address is used.
export const clearedAddress = (address) => (address && !/^https?:\/\/[^\s/?#]+/i.test(String(address)) ? { base_url: "" } : {});

export function element(tag, className = "", text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function request(api, path, payload, signal) {
  const options = payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal } : {signal};
  const response = await api.fetchApi(path, options);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || data.reason || "The request failed.");
  return data;
}
