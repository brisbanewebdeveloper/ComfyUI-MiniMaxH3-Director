// Provider declarations live in node properties; only an environment-variable name is saved, never the key.
import { values, applyValues, element, request } from "./ng_widgets.js";
const { api } = window.comfyAPI.api;
const DEFAULTS = { schema_version: 1, provider: "ollama", base_url: "", model: "", api_key_env: "", vision: true, audio: false };

function settings(node, root) {
  const details = element("details");
  details.append(element("summary", "", "Analysis provider"));
  const fields = {};
  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    const value = node.properties.ng_provider?.[key] ?? defaultValue;
    if (key === "schema_version") continue;
    const label = element("label", "", key.replaceAll("_", " "));
    const field = element(key === "provider" ? "select" : "input");
    field.setAttribute("aria-label", key.replaceAll("_", " "));
    if (key === "provider") {
      for (const name of ["ollama", "lmstudio", "custom"]) { const option = element("option", "", name); option.value = name; field.append(option); }
    }
    if (typeof value === "boolean") { field.type = "checkbox"; field.checked = value; } else field.value = value;
    fields[key] = field; label.append(field); details.append(label);
    field.onchange = () => {
      node.properties.ng_provider = { schema_version: 1 };
      for (const [name, input] of Object.entries(fields)) node.properties.ng_provider[name] = input.type === "checkbox" ? input.checked : input.value;
      node.graph?.change();
      node.setDirtyCanvas?.(true, true);
    };
  }
  details.append(element("small", "", "Vision: image or three video stills. Audio: first 15 s; requires input_audio support. Keys come from the ComfyUI server environment."));
  root.append(details);
  return () => {
    for (const [key, field] of Object.entries(fields)) {
      const value = node.properties.ng_provider?.[key] ?? DEFAULTS[key];
      if (field.type === "checkbox") field.checked = value; else field.value = value;
    }
  };
}

export function attachAnalysis(node, media, root, status) {
  const synchronize = settings(node, root);
  const configured = node.onConfigure;
  node.onConfigure = function (...args) { const result = configured?.apply(this, args); synchronize(); return result; };
  const tools = element("div", "ng-tools");
  const analyze = element("button", "", "Analyze context");
  const apply = element("button", "", "Apply suggestion");
  apply.disabled = true;
  const output = element("div", "ng-suggestion");
  tools.append(analyze, apply); root.append(tools, output);
  let suggestion = null;
  let snapshot = null;
  analyze.onclick = async () => {
    analyze.disabled = true; apply.disabled = true; suggestion = null;
    snapshot = JSON.stringify(values(node));
    output.textContent = "Analyzing…";
    try {
      const data = await request(api, "/ng/analyze", { media, widgets: values(node), provider: { ...DEFAULTS, ...node.properties.ng_provider } });
      suggestion = data.suggestion;
      output.textContent = `${suggestion.content}: ${suggestion.description}`;
      apply.disabled = false;
    } catch (error) { output.textContent = error.message; } finally { analyze.disabled = false; }
  };
  apply.onclick = () => {
    if (snapshot !== JSON.stringify(values(node))) { status.textContent = "This context changed during analysis; analyze it again before applying."; apply.disabled = true; return; }
    const content = node.widgets?.find((w) => w.name === "content");
    const changes = { description: suggestion.description };
    if (content?.options?.values?.includes(suggestion.content)) changes.content = suggestion.content;
    applyValues(node, changes); apply.disabled = true;
    status.textContent = "Applied the description and supported content. Usage and preserve stay as set.";
  };
}
