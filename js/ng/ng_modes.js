// Presentation mode is local workflow state. It never changes a compiled or rendered plan.
import { element } from "./ng_widgets.js";

export function attachModes(node, container, plan) {
  node.properties ||= {};
  const bar = element("div", "ng-modebar");
  const buttons = [];
  function update(mode) {
    node.properties.ng_view_mode = mode;
    plan.dataset.mode = mode;
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    node.setDirtyCanvas?.(true, true);
  }
  for (const mode of ["simple", "guided", "expert"]) {
    const button = element("button", "", mode[0].toUpperCase() + mode.slice(1));
    button.dataset.mode = mode;
    button.onclick = () => { update(mode); node.graph?.change(); };
    buttons.push(button); bar.append(button);
  }
  container.append(bar);
  update(node.properties.ng_view_mode || "guided");
  const configured = node.onConfigure;
  node.onConfigure = function (...args) {
    const result = configured?.apply(this, args);
    update(node.properties.ng_view_mode || "guided");
    return result;
  };
}
