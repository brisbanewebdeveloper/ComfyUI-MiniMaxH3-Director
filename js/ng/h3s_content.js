// Prompt field and the Content cards that come from the Context nodes in the graph.
import { h, icon } from "./h3s_dom.js";

const KIND = { image: "Bild", video: "Video", audio: "Audio", text: "Text" };
const BG = { image: "#172338", video: "#2A2414", audio: "#221A33", text: "#13291F" };
const USAGE = { reference: "Vorbild", first_frame: "Startbild", last_frame: "Endbild", keyframe: "Keyframe", storyboard: "Storyboard",
  motion: "Bewegung", camera: "Kamera", continue: "Fortsetzen", structure: "Aufbau", voice: "Stimme", copy: "Übernehmen", lock: "Fest",
  music_style: "Musikstil", rhythm: "Rhythmus", sound_reference: "Klang", style: "Stil", rule: "Regel", character: "Figur", world: "Welt",
  scene: "Szene", dialogue: "Dialog", constraint: "Vorgabe", instruction: "Anweisung" };
const BARS = [8, 14, 22, 12, 30, 18, 26, 10, 34];

function usageOf(widgets, media) {
  let usage = [widgets.usage];
  if (widgets.usage_roles) try { usage = JSON.parse(widgets.usage_roles); } catch { usage = [widgets.usage]; }
  return (Array.isArray(usage) ? usage : []).filter(Boolean).length ? usage.filter(Boolean) : [{ image: "reference", video: "motion", audio: "voice", text: "style" }[media]];
}

// One plain record per connected Context node; the cards, panels and timeline all read these.
export function contentEntries(raw, colorOf) {
  return raw.map((entry) => {
    const usage = usageOf(entry.widgets, entry.media);
    return { id: entry.widgets.context_id || entry.widgets.name, media: entry.media, name: entry.widgets.name || KIND[entry.media],
      source: entry.widgets[entry.media] || "", color: colorOf(entry), bg: BG[entry.media], kind: KIND[entry.media], usage,
      role: usage.map((value) => USAGE[value] || value).join(", "), raw: entry };
  });
}

function visual(entry, thumb) {
  const box = h("div", { class: "h3s-ctx-visual", style: { background: entry.bg, color: entry.color } });
  const src = thumb(entry);
  if (src) box.append(h("img", { src, alt: "" }));
  else if (entry.media === "audio") box.append(h("div", { style: { display: "flex", alignItems: "center", gap: "2px", height: "30px" } },
    BARS.map((height) => h("span", { style: { width: "3px", height: `${height * 0.8}px`, borderRadius: "2px", background: "currentColor" } }))));
  else box.append(icon(entry.media === "video" ? "video" : entry.media === "text" ? "text" : "image", 24));
  return box;
}

export function promptView(S, actions) {
  return h("section", { class: "h3s-card" },
    h("div", { class: "h3s-row" }, h("label", { class: "h3s-strong", for: "h3s-prompt" }, "Prompt"),
      h("span", { class: "h3s-lbl" }, "Beschreibe, was passieren soll. Mehr braucht es nicht."), h("span", { class: "h3s-grow" }),
      h("button", { class: "h3s-btn ai", disabled: !S.ai || Boolean(S.busy), onclick: actions.splitPrompt,
        title: S.ai ? "Die KI schlägt Shots vor; du übernimmst oder verwirfst sie." : "Dafür einen H3 AI Loader an den Connector anschließen." },
        icon("spark"), S.busy === "split" ? "KI arbeitet …" : "KI: in Shots aufteilen"),
      S.busy === "split" ? h("button", { class: "h3s-btn ghost", onclick: actions.cancelAI }, "Abbrechen") : null,
      h("button", { class: "h3s-btn", onclick: actions.promptAsShot }, "Ganzer Prompt = ein Shot")),
    h("textarea", { class: "h3s-in", id: "h3s-prompt", rows: 3, value: S.values.idea || "", placeholder: "Eine junge Frau spielt draußen mit einem roten Ball …",
      oninput: (event) => actions.setWidget("idea", event.target.value, false) }));
}

export function contentView(S, actions) {
  const selectedShot = S.selected?.kind === "shot" ? S.shots.find((shot) => shot.id === S.selected.id) : null;
  const drag = (id) => (event) => { actions.setDragged(id); try { event.dataTransfer.setData("text/plain", id); event.dataTransfer.effectAllowed = "copy"; } catch {} };
  const cards = [h("button", { class: "h3s-ctx", draggable: true, ondragstart: drag("__text"), ondragend: actions.endDrag,
    onclick: () => actions.newShot(null, "__text"), title: "Leerer Shot nur mit Text" },
    h("div", { class: "h3s-ctx-visual", style: { color: "#9AA4B5", background: "#121722" } }, icon("plus", 24)),
    h("div", { class: "h3s-ctx-text" }, h("span", { class: "h3s-strong" }, "Text-Shot"), h("span", { class: "h3s-lbl" }, "nur Text, ohne Medien")))];
  for (const entry of S.contexts) {
    const assigned = Boolean(selectedShot?.media.some((binding) => binding.context_id === entry.id));
    const unused = S.values.mode === "fl2va" && entry.media === "video";
    const tip = unused ? "Wird bei Start-/Endbild (FL2VA) nicht genutzt" : entry.media === "audio"
      ? "Auf eine Tonspur ziehen = läuft durchgehend · auf einen Shot = nur in diesem Shot"
      : selectedShot ? `Klicken: ${assigned ? "aus" : "zu"} ${actions.shotLabel(selectedShot.id)} ${assigned ? "entfernen" : "hinzufügen"}` : "Auf die Timeline ziehen";
    cards.push(h("button", { class: `h3s-ctx${assigned ? " on" : ""}${unused ? " off" : ""}`, draggable: true, title: tip,
      ondragstart: drag(entry.id), ondragend: actions.endDrag, onclick: () => actions.toggleBinding(entry.id) },
      visual(entry, actions.thumb),
      assigned ? h("span", { class: "h3s-badge" }, "im Shot") : null,
      h("div", { class: "h3s-ctx-text" }, h("span", { class: "h3s-strong", style: { display: "flex", alignItems: "center", gap: "6px" } },
        h("span", { class: "h3s-swatch", style: { background: entry.color } }), entry.name), h("span", { class: "h3s-lbl" }, `${entry.kind} · ${entry.role}`))));
  }
  cards.push(h("div", { class: "h3s-hint" }, S.contexts.length ? "Weiterer Content kommt aus Context-Nodes im Graph" : "Noch kein Content: Context-Nodes an den Context Connector anschließen. Ohne Content geht es auch nur mit Text."));
  return h("section", { class: "h3s-card" },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-strong" }, "Content"),
      h("span", { class: "h3s-lbl" }, "Auf die Timeline ziehen = neuer Shot · auf einen Shot ziehen oder anklicken = zuordnen · Audio auf eine Tonspur")),
    h("div", { class: "h3s-content" }, cards));
}
