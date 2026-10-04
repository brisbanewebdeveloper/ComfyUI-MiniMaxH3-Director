import { element } from "./ng_widgets.js";
import { LOCK_FIELDS } from "./ng_story_model.js";

const ROLES = {
  image: ["reference", "first_frame", "keyframe", "last_frame", "storyboard"],
  video: ["motion", "camera", "continue", "structure"],
  audio: ["voice", "copy", "lock", "music_style", "rhythm", "sound_reference"],
  text: ["style", "rule", "character", "world", "scene", "camera", "dialogue", "constraint", "instruction"]
};
function option(select, value, caption) {
  const entry = element("option", "", caption); entry.value = value; select.append(entry);
}
function selectField(label, options, value, change) {
  const select = element("select"); select.setAttribute("aria-label", label);
  for (const [identity, caption] of options) option(select, identity, caption);
  select.value = value; select.onchange = () => change(select.value); return select;
}
function textField(label, value, change, multiline = false) {
  const input = element(multiline ? "textarea" : "input"); input.value = value;
  input.setAttribute("aria-label", label); input.oninput = () => change(input.value); return input;
}

export function shotFields(shot, index, entries, commit, rebuild) {
  const root = element("div", "ng-shot-bindings"), number = index + 1;
  const available = entries.filter(entry => entry.widgets.context_id);
  for (const [position, binding] of shot.media.entries()) {
    const entry = available.find(entry => entry.widgets.context_id === binding.context_id);
    const row = element("div", "ng-shot-binding");
    row.append(element("span", entry ? "" : "ng-error", entry?.widgets.name || `Disconnected context: ${binding.context_id}`));
    const roles = [["context", "Use context settings"], ...(ROLES[entry?.media] || []).map(role => [role, role.replaceAll("_", " ")])];
    if (!roles.some(([role]) => role === binding.role)) roles.push([binding.role, binding.role]);
    row.append(selectField(`Shot ${number} media ${position + 1} role`, roles, binding.role, value => { binding.role = value; commit(); }));
    const remove = element("button", "ng-icon-button", "×"); remove.setAttribute("aria-label", `Remove shot ${number} media ${position + 1}`);
    remove.onclick = () => { shot.media.splice(position, 1); commit(); rebuild(); }; row.append(remove); root.append(row);
  }
  const context = selectField(`Shot ${number} context`, [["", "+ Assign context"], ...available.map(entry => [entry.widgets.context_id, entry.widgets.name || entry.media])], "", identity => {
    if (!identity || shot.media.some(binding => binding.context_id === identity)) return;
    shot.media.push({ schema_version: 1, context_id: identity, role: "context" }); commit(); rebuild();
  });
  context.disabled = !available.length; root.append(context);
  const dialogue = element("details", "ng-shot-dialogue"); dialogue.append(element("summary", "", `Dialogue · ${shot.spoken.length} line${shot.spoken.length === 1 ? "" : "s"}`));
  for (const [position, spoken] of shot.spoken.entries()) {
    const row = element("div", "ng-spoken-line"), prefix = `Shot ${number} dialogue ${position + 1}`;
    const speakers = [["", "Narrator / described voice"], ...available.filter(entry => entry.media === "image").map(entry => [entry.widgets.context_id, entry.widgets.name])];
    if (!speakers.some(([id]) => id === spoken.speaker_id)) speakers.push([spoken.speaker_id, "Disconnected speaker"]);
    row.append(selectField(`${prefix} speaker`, speakers, spoken.speaker_id || "", value => { spoken.speaker_id = value; commit(); }));
    for (const [key, caption, fallback] of [["voice", "Voice description", "a narrator"], ["language", "Language", "English"], ["delivery", "Delivery", "says"], ["text", "Exact spoken words", ""]]) {
      const label = element("label", "ng-field"); label.append(element("span", "ng-field-label", caption),
        textField(`${prefix} ${key}`, spoken[key] ?? fallback, value => { spoken[key] = value; commit(); })); row.append(label);
    }
    const remove = element("button", "ng-secondary", "Remove line"); remove.setAttribute("aria-label", `Remove ${prefix}`);
    remove.onclick = () => { shot.spoken.splice(position, 1); commit(); rebuild(); }; row.append(remove); dialogue.append(row);
  }
  const add = element("button", "ng-secondary", "+ Spoken line"); add.setAttribute("aria-label", `Add shot ${number} spoken line`);
  add.onclick = () => { shot.spoken.push({ schema_version: 1, speaker_id: "", voice: "a narrator", language: "English", delivery: "says", text: "" }); commit(); rebuild(); };
  dialogue.append(add); root.append(dialogue);
  const protection = element("details", "ng-shot-protection"), protectionTitle=element("summary", "", `Protect from AI · ${shot.locked_fields.length} fields`);
  protection.append(protectionTitle);
  for (const key of LOCK_FIELDS) {
    const label = element("label", "ng-lock-field"), input = element("input"); input.type = "checkbox";
    input.setAttribute("aria-label", `Protect shot ${number} ${key} from AI`); input.checked = shot.locked_fields.includes(key);
    input.onchange = () => { shot.locked_fields = input.checked ? [...new Set([...shot.locked_fields, key])] : shot.locked_fields.filter(field => field !== key);
      protectionTitle.textContent=`Protect from AI · ${shot.locked_fields.length} fields`;commit(); };
    label.append(input, element("span", "", key)); protection.append(label);
  }
  protection.append(element("small", "ng-muted", "Manual edits remain available. AI Apply skips protected fields; bindings, dialogue and timing require explicit selection."));
  root.append(protection); return root;
}
