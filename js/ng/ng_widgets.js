// Shared widget reads and edits, also used by presets so edits notify the plan panel.
export function values(node) {
  return Object.fromEntries((node.widgets || []).filter((w) => w.name).map((w) => [w.name, w.value]));
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
