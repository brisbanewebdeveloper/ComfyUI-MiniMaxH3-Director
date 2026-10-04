// The Context cards' stored settings: context_options (preserve, source range, keyframe time, video sound) and the
// content/usage role lists. The cards draw them (h3c_*.js); these functions only read and write the widgets.
import { values, applyValues } from "./ng_widgets.js";

export function contextOptions(node) {
  const text = values(node).context_options;
  return { schema_version:1, preserve:{}, start_s:0, end_s:0, anchor_s:-1, video_audio:"ignore",
    ...(text ? JSON.parse(text) : {}) };
}
export function setOptions(node, changes) { applyValues(node,{context_options:JSON.stringify({...contextOptions(node),...changes})}); node.graph?.change?.(); }
export function selectedRoles(node, type) {
  const now=values(node), text=now[type+"_roles"];
  return text ? JSON.parse(text) : now[type] ? [now[type]] : [];
}
