// The existing Comfy widgets remain the serialized values; this module provides the visible controls.
import { element } from "./ng_widgets.js";

export function hideNative(node, names) {
  for (const widget of node.widgets || []) {
    if (!names.includes(widget.name)) continue;
    const input = node.inputs?.find((entry) => entry.widget?.name === widget.name);
    if (input?.link != null) continue;
    widget.hidden = true;
    widget.options ||= {};
    widget.options.hidden = true;
    widget.computeSize = () => [0, -4];
    widget.computeLayoutSize = () => ({minHeight:0,maxHeight:0,minWidth:0});
    widget.draw = () => {};
    widget.drawWidget = () => {};
    if (widget.element) widget.element.style.display = "none";
  }
  // Preserve real model/context ports and any connected widget inputs.
  for (let i = (node.inputs?.length || 0) - 1; i >= 0; i--) {
    const input = node.inputs[i];
    if (names.includes(input.widget?.name) && input.link == null) node.removeInput(i);
  }
}

export function control(node, name, labelText, options = {}) {
  const widget = node.widgets?.find((entry) => entry.name === name);
  const label = element("label", "ng-field");
  label.append(element("span", "ng-field-label", labelText));
  const choices = options.choices || widget?.options?.values;
  const field = element(options.multiline ? "textarea" : Array.isArray(choices) ? "select" : "input");
  field.setAttribute("aria-label", labelText);
  if (Array.isArray(choices) && !options.multiline) {
    for (const value of choices) {
      const option = element("option", "", String(value).replaceAll("_", " "));
      option.value = value; field.append(option);
    }
  } else if (options.boolean) {
    field.type = "checkbox";
  } else if (options.number) {
    field.type = "number"; field.step = options.step || "any";
    if (widget?.options?.min !== undefined) field.min = widget.options.min;
    if (widget?.options?.max !== undefined) field.max = widget.options.max;
  }
  const sync = () => {
    if (Array.isArray(choices) && !options.multiline && widget?.value && !Array.from(field.children).some((option) => option.value === widget.value)) {
      const option = element("option", "", String(widget.value)); option.value = widget.value; field.append(option);
    }
    if (options.boolean) field.checked = !!widget?.value;
    else if (document.activeElement !== field) field.value = widget?.value ?? "";
    field.disabled = !widget || node.inputs?.some((entry) => entry.widget?.name === name && entry.link != null);
  };
  sync();
  field.oninput = () => {
    if (!widget || field.disabled) return;
    if (options.number && (field.value === "" || !field.checkValidity())) return;
    widget.value = options.boolean ? field.checked : options.number ? Number(field.value) : field.value;
    widget.callback?.(widget.value);
    node.graph?.change(); node.setDirtyCanvas?.(true, true);
  };
  const original = widget?.callback;
  if (widget) widget.callback = function (...args) { const result = original?.apply(this, args); sync(); return result; };
  label.append(field);
  return { label, field, sync };
}

export function section(title, className = "") {
  const root = element("section", "ng-section " + className);
  root.append(element("h3", "ng-section-title", title));
  return root;
}
