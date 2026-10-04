// Right column: how H3 works (FL2VA / Ref2VA, Turbo) and the panel of the selected shot or audio clip.
import { h, icon, field, select } from "./h3s_dom.js";
import { span, clipParts, sorted } from "./h3s_model.js";

const LANGUAGES = [["English", "Englisch"], ["German", "Deutsch"], ["French", "Französisch"], ["Spanish", "Spanisch"],
  ["Italian", "Italienisch"], ["Japanese", "Japanisch"], ["Chinese", "Chinesisch"]];
const CLIP_MODES = [["lock", "Genau so übernehmen (Ton bleibt fest)"], ["copy", "Möglichst übernehmen (H3 darf abweichen)"],
  ["ref", "Nur als Vorbild (Stimmung, Stimme, Stil)"]];

function modeCard(S, actions) {
  const mode = S.values.mode, decided = S.plan?.mode;
  const seg = (value, title, text) => h("button", { class: mode === value ? "h3s-seg on" : "h3s-seg", onclick: () => actions.setWidget("mode", value),
    "aria-pressed": String(mode === value) }, h("span", { class: "h3s-strong" }, title), h("span", { class: "h3s-lbl" }, text));
  const hint = mode === "fl2va" ? "Ein Bild wird zum ersten, eins zum letzten Bild jedes Render-Teils; Ton kommt aus den Tonspuren. Videos und Vorbilder werden nicht genutzt."
    : mode === "ref2va" ? "H3 nimmt bis zu 9 Bilder, 3 Videos und 3 Tonquellen als Vorbild, z. B. für Figur, Ort, Kamera und Stimme."
      : `Automatisch: ${decided === "ref2va" ? "Referenzen" : "Start-/Endbild"}, je nach Content. Zum Festlegen eine Seite anklicken.`;
  const turbo = Boolean(S.values.turbo);
  const loras = [];
  if (turbo) for (const [name, label] of [["turbo_lora_fl2va", "Turbo-LoRA Start-/Endbild"], ["turbo_lora_ref2va", "Turbo-LoRA Referenzen"]]) {
    if (mode === "fl2va" && name.endsWith("ref2va")) continue;
    if (mode === "ref2va" && name.endsWith("fl2va")) continue;
    const options = (S.options[name] || ["none"]).map((value) => [value, value === "none" ? "keine" : value]);
    loras.push(field(label, select(options, S.values[name], (value) => actions.setWidget(name, value), { style: { maxWidth: "100%" } })));
    if (S.values[name] === "none") loras.push(h("span", { class: "h3s-warn", style: { fontSize: "12px" } },
      "Ohne Turbo-LoRA liefern 4 Steps kein brauchbares Bild. LoRA wählen oder Turbo ausschalten."));
  }
  return h("section", { class: "h3s-card" },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-strong" }, "Arbeitsweise"), h("span", { class: "h3s-lbl" }, "Die wichtigste Entscheidung zuerst")),
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "8px" } },
      seg("fl2va", "Start- / Endbild", "FL2VA · erstes/letztes Bild + Ton"), seg("ref2va", "Referenzen", "Ref2VA · Figur, Ort, Video, Stimme")),
    h("span", { style: { fontSize: "13px", color: "#B4BDCC" } }, hint),
    h("button", { class: "h3s-toggle", "aria-pressed": String(turbo), onclick: () => actions.setTurbo(!turbo) },
      h("span", { class: turbo ? "h3s-switch on" : "h3s-switch" }),
      h("span", { style: { display: "flex", flexDirection: "column", gap: "2px" } }, h("span", { class: "h3s-strong" }, `Turbo ${turbo ? "an" : "aus"}`),
        h("span", { class: "h3s-lbl" }, turbo ? "Turbo-LoRA, 4 Steps, CFG 1. Schnell zum Ausprobieren." : "20 Steps, volles Modell, CFG 1. Für den finalen Lauf."))),
    loras);
}

function speakers(S) {
  const subjects = S.contexts.filter((entry) => entry.media === "image" && entry.usage.includes("reference") && entry.id);
  return [["", "Erzähler (keine Figur)"], ...subjects.map((entry) => [entry.id, entry.name])];
}

function shotPanel(S, actions, shot) {
  const spoken = shot.spoken[0] || { schema_version: 1, text: "", speaker_id: "", voice: "a narrator", language: "English", delivery: "says" };
  const suggestion = S.suggestions[shot.id];
  const chunks = (S.plan?.chunks || []).filter((chunk) => chunk.shots.some((entry) => entry.shot_id === shot.id)).map((chunk) => `Render-Teil ${chunk.index + 1}`);
  const media = shot.media.map((binding) => [binding, S.byId.get(binding.context_id)]);
  const number = (key, value) => h("input", { class: "h3s-in", type: "number", step: "0.1", min: "0", value,
    onchange: (event) => actions.setShotTime(shot.id, key, Number(event.target.value)) });
  return h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-strong", style: { fontSize: "16px" } }, actions.shotLabel(shot.id)),
      h("span", { class: "h3s-muted", style: { fontSize: "12px" } }, span(shot.start, shot.end)), h("span", { class: "h3s-grow" }),
      h("button", { class: "h3s-btn ghost", title: "Shot löschen", "aria-label": "Shot löschen", onclick: () => actions.deleteShot(shot.id) }, icon("trash"))),
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" } },
      field("Start (s)", number("start", shot.start)), field("Ende (s)", number("end", shot.end))),
    field("Was passiert?", h("textarea", { class: "h3s-in", rows: 3, value: shot.text, placeholder: "Eigener Text genügt. KI ist optional.",
      oninput: (event) => actions.setShotText(shot.id, event.target.value) })),
    suggestion ? h("div", { class: "h3s-suggest" }, h("span", { class: "h3s-lbl", style: { color: "#C9BBFF" } }, "KI-Vorschlag für diesen Shot"),
      h("span", { style: { color: "#ECE6FF", lineHeight: 1.45 } }, suggestion),
      h("div", { class: "h3s-row" }, h("button", { class: "h3s-btn ai", onclick: () => actions.acceptSuggestion(shot.id) }, "Übernehmen"),
        h("button", { class: "h3s-btn ghost", onclick: () => actions.dropSuggestion(shot.id) }, "Verwerfen"))) : null,
    h("div", { class: "h3s-row" }, h("button", { class: "h3s-btn ai", disabled: !S.ai || S.busy, onclick: () => actions.suggest(shot.id) }, icon("spark"),
      S.busy === "suggest" ? "KI arbeitet …" : shot.text ? "KI: Text verbessern" : "KI: Text vorschlagen"),
      S.busy === "suggest" ? h("button", { class: "h3s-btn ghost", onclick: actions.cancelAI }, "Abbrechen") : null),
    S.ai ? null : h("span", { class: "h3s-lbl" }, "Kein AI Loader verbunden. Alles funktioniert trotzdem von Hand."),
    h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, h("span", { class: "h3s-lbl" }, "Content in diesem Shot"),
      media.length ? null : h("span", { class: "h3s-muted", style: { fontSize: "13px" } }, "Keiner: reiner Text-Shot. Content oben anklicken oder auf den Shot ziehen."),
      media.map(([binding, entry]) => h("div", { class: "h3s-item" }, h("span", { class: "h3s-swatch", style: { background: entry?.color || "#ffc273" } }),
        h("span", { class: "h3s-strong" }, entry?.name || "Nicht verbunden"), h("span", { class: "h3s-lbl" }, entry ? `${entry.kind} · ${entry.role}` : binding.context_id),
        h("span", { class: "h3s-grow" }), h("button", { class: "h3s-btn ghost small", title: "Aus Shot entfernen", "aria-label": "Aus Shot entfernen",
          onclick: () => actions.unassign(shot.id, binding.context_id) }, icon("close", 14))))),
    h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, h("span", { class: "h3s-lbl" }, "Gesprochen (optional, wird wörtlich übernommen)"),
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "8px" } },
        select(speakers(S), spoken.speaker_id, (value) => actions.setSpoken(shot.id, { speaker_id: value }), { "aria-label": "Wer spricht" }),
        select(LANGUAGES, spoken.language, (value) => actions.setSpoken(shot.id, { language: value }), { "aria-label": "Sprache" })),
      h("input", { class: "h3s-in", type: "text", value: spoken.text, placeholder: "Satz, der gesprochen wird", "aria-label": "Gesprochener Satz",
        oninput: (event) => actions.setSpoken(shot.id, { text: event.target.value.replace(/[\r\n]+/g, " ") }, false) }),
      shot.spoken.length > 1 ? h("span", { class: "h3s-lbl" }, `${shot.spoken.length - 1} weitere gesprochene Zeile(n) bleiben unverändert erhalten.`) : null),
    h("span", { class: "h3s-lbl" }, `Liegt in: ${chunks.join(", ") || "–"}`));
}

function clipPanel(S, actions, clip) {
  const entry = S.byId.get(clip.context_id), lane = S.lanes.indexOf(clip.lane) + 1;
  const flOnly = S.values.mode === "fl2va";
  const modes = flOnly ? CLIP_MODES.filter(([value]) => value === "lock" || value === clip.mode) : CLIP_MODES;
  const number = (key, value) => h("input", { class: "h3s-in", type: "number", step: "0.1", min: "0", value,
    onchange: (event) => actions.setClip(clip.id, key, Number(event.target.value)) });
  return h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-swatch", style: { background: entry?.color || "#B38CF5", width: "10px", height: "10px" } }),
      h("span", { class: "h3s-strong", style: { fontSize: "16px" } }, entry?.name || "Nicht verbunden"), h("span", { class: "h3s-lbl" }, `Tonspur ${lane}`),
      h("span", { class: "h3s-grow" }), h("button", { class: "h3s-btn ghost", title: "Tonclip entfernen", "aria-label": "Tonclip entfernen",
        onclick: () => actions.deleteClip(clip.id) }, icon("trash"))),
    h("span", { style: { color: "#B4BDCC" } }, "Dieser Ton läuft durchgehend, egal wie viele Shots darüber liegen. Jeder Render-Teil bekommt automatisch seinen Abschnitt, nicht wieder den Anfang."),
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "10px" } },
      field("Start (s)", number("start", clip.start)), field("Ende (s)", number("end", clip.end)), field("Ab Sekunde im File", number("offset", clip.offset))),
    field("Wie soll H3 den Ton nutzen?", select(modes, clip.mode, (value) => actions.setClip(clip.id, "mode", value))),
    flOnly ? h("span", { class: "h3s-lbl" }, "Bei Start-/Endbild (FL2VA) kann H3 Ton nur fest übernehmen; Vorbild und Übernehmen brauchen Referenzen (Ref2VA).") : null,
    h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, h("span", { class: "h3s-lbl" }, "So wird der Ton auf die Render-Teile verteilt"),
      clipParts(clip, S.plan?.chunks || []).map((part) => h("div", { class: "h3s-item", style: { fontSize: "13px" } },
        h("strong", {}, `Teil ${part.index + 1}`), h("span", { class: "h3s-muted" }, `Story ${span(...part.story)} → spielt File ${span(...part.file)}`)))));
}

export function sideView(S, actions) {
  const shot = S.selected?.kind === "shot" && S.shots.find((entry) => entry.id === S.selected.id);
  const clip = S.selected?.kind === "clip" && S.audio.find((entry) => entry.id === S.selected.id);
  const empty = h("div", { style: { display: "flex", flexDirection: "column", gap: "10px", color: "#B4BDCC", lineHeight: 1.5 } },
    h("span", { class: "h3s-strong", style: { color: "#E6EAF2", fontSize: "15px" } }, "Kein Shot gewählt"),
    h("span", {}, "Klicke einen Shot an, um Text, Content, Dialog und KI-Vorschlag für genau diesen Shot zu bearbeiten. Ein Klick auf einen Tonclip zeigt, welcher Teil des Files in welchem Render-Teil läuft."),
    h("span", {}, sorted(S.shots).length ? "" : "Ohne Shots rendert der Director einfach den Prompt."));
  return [modeCard(S, actions), h("aside", { class: "h3s-card", style: { gap: "12px" } }, shot ? shotPanel(S, actions, shot) : clip ? clipPanel(S, actions, clip) : empty)];
}

