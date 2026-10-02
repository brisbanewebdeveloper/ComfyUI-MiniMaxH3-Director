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

export function applyValues(node, changes) {
  for (const widget of node.widgets || []) {
    if (!(widget.name in changes)) continue;
    widget.value = changes[widget.name];
    widget.callback?.(widget.value);
  }
  node.setDirtyCanvas?.(true, true);
  document.dispatchEvent(new CustomEvent("ng-context-changed"));
}

export function element(tag, className = "", text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function request(api, path, payload) {
  const options = payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {};
  const response = await api.fetchApi(path, options);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "The request failed.");
  return data;
}
