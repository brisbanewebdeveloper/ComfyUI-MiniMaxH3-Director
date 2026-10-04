// Right column: how H3 works (FL2VA / Ref2VA, Turbo) and the panel of the selected shot or audio clip.
import { h, icon, field, select } from "./h3s_dom.js";
import { span, clipParts, sorted } from "./h3s_model.js";

const LANGUAGES = ["English", "German", "French", "Spanish", "Italian", "Japanese", "Chinese"].map((name) => [name, name]);
const CLIP_MODES = [["lock", "Lock exactly (the sound stays fixed)"], ["copy", "Copy as closely as possible (H3 may vary)"],
  ["ref", "Reference only (mood, voice, style)"]];

function modeCard(S, actions) {
  const mode = S.values.mode, decided = S.plan?.mode;
  const seg = (value, title, text) => h("button", { class: mode === value ? "h3s-seg on" : "h3s-seg", onclick: () => actions.setWidget("mode", value),
    "aria-pressed": String(mode === value) }, h("span", { class: "h3s-strong" }, title), h("span", { class: "h3s-lbl" }, text));
  const hint = mode === "fl2va" ? "One picture becomes the first, one the last frame of a render part; sound comes from the audio lanes. Videos and references are not used."
    : mode === "ref2va" ? "H3 takes up to 9 images, 3 videos and 3 audio sources as references, e.g. for a character, place, camera and voice."
      : `Automatic: ${decided === "ref2va" ? "References" : "First/last frame"}, depending on the Content. Click one side to fix it.`;
  const turbo = Boolean(S.values.turbo);
  const loras = [];
  if (turbo) for (const [name, label] of [["turbo_lora_fl2va", "Turbo LoRA first/last frame"], ["turbo_lora_ref2va", "Turbo LoRA references"]]) {
    if (mode === "fl2va" && name.endsWith("ref2va")) continue;
    if (mode === "ref2va" && name.endsWith("fl2va")) continue;
    const options = (S.options[name] || ["none"]).map((value) => [value, value === "none" ? "none" : value]);
    loras.push(field(label, select(options, S.values[name], (value) => actions.setWidget(name, value), { style: { maxWidth: "100%" } })));
    if (S.values[name] === "none") loras.push(h("span", { class: "h3s-warn", style: { fontSize: "12px" } },
      "Without a turbo LoRA, 4 steps give no usable picture. Choose a LoRA or switch Turbo off."));
  }
  return h("section", { class: "h3s-card" },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-strong" }, "Mode"), h("span", { class: "h3s-lbl" }, "The most important choice first")),
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "8px" } },
      seg("fl2va", "First / last frame", "FL2VA · first/last picture + sound"), seg("ref2va", "References", "Ref2VA · character, place, video, voice")),
    h("span", { style: { fontSize: "13px", color: "#B4BDCC" } }, hint),
    h("button", { class: "h3s-toggle", "aria-pressed": String(turbo), onclick: () => actions.setTurbo(!turbo) },
      h("span", { class: turbo ? "h3s-switch on" : "h3s-switch" }),
      h("span", { style: { display: "flex", flexDirection: "column", gap: "2px" } }, h("span", { class: "h3s-strong" }, `Turbo ${turbo ? "on" : "off"}`),
        h("span", { class: "h3s-lbl" }, turbo ? "Turbo LoRA, 4 steps, CFG 1. Fast for trying things out." : "20 steps, full model, CFG 1. For the final run."))),
    loras);
}

function speakers(S) {
  const subjects = S.contexts.filter((entry) => entry.media === "image" && entry.usage.includes("reference") && entry.id);
  return [["", "Narrator (no character)"], ...subjects.map((entry) => [entry.id, entry.name])];
}

// Every spoken line of the shot; with none yet, one empty editor whose first input creates the line.
function spokenLines(S, actions, shot) {
  const lines = shot.spoken.length ? shot.spoken : [{ text: "", speaker_id: "", language: "English" }];
  return lines.map((line, index) => h("div", { class: "h3s-spoken", style: { display: "flex", flexDirection: "column", gap: "6px" } },
    h("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", gap: "8px" } },
      select(speakers(S), line.speaker_id, (value) => actions.setSpoken(shot.id, index, { speaker_id: value }), { "aria-label": `Speaker of line ${index + 1}` }),
      select(LANGUAGES, line.language, (value) => actions.setSpoken(shot.id, index, { language: value }), { "aria-label": `Language of line ${index + 1}` }),
      shot.spoken.length ? h("button", { class: "h3s-btn ghost small", title: "Remove this line", "aria-label": `Remove line ${index + 1}`,
        onclick: () => actions.removeSpoken(shot.id, index) }, icon("close", 14)) : h("span")),
    h("input", { class: "h3s-in", type: "text", value: line.text, placeholder: "Line that is spoken", "aria-label": `Spoken line ${index + 1}`,
      oninput: (event) => actions.setSpoken(shot.id, index, { text: event.target.value.replace(/[\r\n]+/g, " ") }, false) })));
}

function shotPanel(S, actions, shot) {
  const suggestion = S.suggestions[shot.id];
  const chunks = (S.plan?.chunks || []).filter((chunk) => chunk.shots.some((entry) => entry.shot_id === shot.id)).map((chunk) => `Render part ${chunk.index + 1}`);
  const media = shot.media.map((binding) => [binding, S.byId.get(binding.context_id)]);
  const number = (key, value) => h("input", { class: "h3s-in", type: "number", step: "0.1", min: "0", value,
    onchange: (event) => actions.setShotTime(shot.id, key, Number(event.target.value)) });
  return h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-strong", style: { fontSize: "16px" } }, actions.shotLabel(shot.id)),
      h("span", { class: "h3s-muted", style: { fontSize: "12px" } }, span(shot.start, shot.end)), h("span", { class: "h3s-grow" }),
      h("button", { class: "h3s-btn ghost", title: "Delete shot", "aria-label": "Delete shot", onclick: () => actions.deleteShot(shot.id) }, icon("trash"))),
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" } },
      field("Start (s)", number("start", shot.start)), field("End (s)", number("end", shot.end))),
    field("What happens?", h("textarea", { class: "h3s-in", rows: 3, value: shot.text, placeholder: "Your own text is enough. AI is optional.",
      oninput: (event) => actions.setShotText(shot.id, event.target.value) })),
    suggestion ? h("div", { class: "h3s-suggest" }, h("span", { class: "h3s-lbl", style: { color: "#C9BBFF" } }, "AI suggestion for this shot"),
      h("span", { style: { color: "#ECE6FF", lineHeight: 1.45 } }, suggestion),
      h("div", { class: "h3s-row" }, h("button", { class: "h3s-btn ai", onclick: () => actions.acceptSuggestion(shot.id) }, "Accept"),
        h("button", { class: "h3s-btn ghost", onclick: () => actions.dropSuggestion(shot.id) }, "Discard"))) : null,
    h("div", { class: "h3s-row" }, h("button", { class: "h3s-btn ai", disabled: !S.ai || S.busy, onclick: () => actions.suggest(shot.id) }, icon("spark"),
      S.busy === "suggest" ? "AI working …" : shot.text ? "AI: improve text" : "AI: suggest text"),
      S.busy === "suggest" ? h("button", { class: "h3s-btn ghost", onclick: actions.cancelAI }, "Cancel") : null),
    S.ai ? null : h("span", { class: "h3s-lbl" }, "No AI Loader connected. Everything still works by hand."),
    h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, h("span", { class: "h3s-lbl" }, "Content in this shot"),
      media.length ? null : h("span", { class: "h3s-muted", style: { fontSize: "13px" } }, "None: a text-only shot. Click Content above or drag it onto the shot."),
      media.map(([binding, entry]) => h("div", { class: "h3s-item" }, h("span", { class: "h3s-swatch", style: { background: entry?.color || "#ffc273" } }),
        h("span", { class: "h3s-strong" }, entry?.name || "Not connected"), h("span", { class: "h3s-lbl" }, entry ? `${entry.kind} · ${entry.role}` : binding.context_id),
        h("span", { class: "h3s-grow" }), h("button", { class: "h3s-btn ghost small", title: "Remove from shot", "aria-label": "Remove from shot",
          onclick: () => actions.unassign(shot.id, binding.context_id) }, icon("close", 14))))),
    h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, h("span", { class: "h3s-lbl" }, "Spoken (optional, used word for word, in this order)"),
      spokenLines(S, actions, shot),
      S.values.mode === "fl2va" ? h("span", { class: "h3s-lbl" }, "First / last frame mode has no character references, so a line is spoken by a described voice, "
        + "not by a character from a picture. Switch the mode to References to let a character speak.") : null,
      shot.spoken.length ? h("button", { class: "h3s-btn small", style: { alignSelf: "flex-start" }, onclick: () => actions.addSpoken(shot.id) }, icon("plus", 14), "Spoken line") : null),
    h("span", { class: "h3s-lbl" }, `In: ${chunks.join(", ") || "–"}`));
}

function clipPanel(S, actions, clip) {
  const entry = S.byId.get(clip.context_id), lane = S.lanes.indexOf(clip.lane) + 1;
  const flOnly = S.values.mode === "fl2va";
  const modes = flOnly ? CLIP_MODES.filter(([value]) => value === "lock" || value === clip.mode) : CLIP_MODES;
  const number = (key, value) => h("input", { class: "h3s-in", type: "number", step: "0.1", min: "0", value,
    onchange: (event) => actions.setClip(clip.id, key, Number(event.target.value)) });
  return h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-swatch", style: { background: entry?.color || "#B38CF5", width: "10px", height: "10px" } }),
      h("span", { class: "h3s-strong", style: { fontSize: "16px" } }, entry?.name || "Not connected"), h("span", { class: "h3s-lbl" }, `Audio lane ${lane}`),
      h("span", { class: "h3s-grow" }), h("button", { class: "h3s-btn ghost", title: "Remove audio clip", "aria-label": "Remove audio clip",
        onclick: () => actions.deleteClip(clip.id) }, icon("trash"))),
    h("span", { style: { color: "#B4BDCC" } }, "This sound runs through, however many shots lie above it. Each render part automatically gets its own section, not the beginning again."),
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "10px" } },
      field("Start (s)", number("start", clip.start)), field("End (s)", number("end", clip.end)), field("From second in file", number("offset", clip.offset))),
    field("How should H3 use the sound?", select(modes, clip.mode, (value) => actions.setClip(clip.id, "mode", value))),
    flOnly ? h("span", { class: "h3s-lbl" }, "In First/last frame mode (FL2VA) H3 can only lock sound; reference and copy need References mode (Ref2VA).") : null,
    h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, h("span", { class: "h3s-lbl" }, "How the sound is split across the render parts"),
      clipParts(clip, S.plan?.chunks || []).map((part) => h("div", { class: "h3s-item", style: { fontSize: "13px" } },
        h("strong", {}, `Part ${part.index + 1}`), h("span", { class: "h3s-muted" }, part.reference ? `Story ${span(...part.story)} → gets file ${span(...part.file)} as a reference` : `Story ${span(...part.story)} → plays file ${span(...part.file)}`)))));
}

export function sideView(S, actions) {
  const shot = S.selected?.kind === "shot" && S.shots.find((entry) => entry.id === S.selected.id);
  const clip = S.selected?.kind === "clip" && S.audio.find((entry) => entry.id === S.selected.id);
  const empty = h("div", { style: { display: "flex", flexDirection: "column", gap: "10px", color: "#B4BDCC", lineHeight: 1.5 } },
    h("span", { class: "h3s-strong", style: { color: "#E6EAF2", fontSize: "15px" } }, "No shot selected"),
    h("span", {}, "Click a shot to edit text, Content, dialogue and AI suggestion for exactly that shot. Clicking an audio clip shows which part of the file plays in which render part."),
    h("span", {}, sorted(S.shots).length ? "" : "Without shots the Director simply renders the prompt."));
  return [modeCard(S, actions), h("aside", { class: "h3s-card", style: { gap: "12px" } }, shot ? shotPanel(S, actions, shot) : clip ? clipPanel(S, actions, clip) : empty)];
}

