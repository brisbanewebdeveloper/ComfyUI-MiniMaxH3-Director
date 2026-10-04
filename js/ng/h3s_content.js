// Prompt field and the Content cards that come from the Context nodes in the graph.
import { h, icon } from "./h3s_dom.js";

const KIND = { image: "Image", video: "Video", audio: "Audio", text: "Text" };
const BG = { image: "#172338", video: "#2A2414", audio: "#221A33", text: "#13291F" };
const USAGE = { reference: "Reference", first_frame: "First frame", last_frame: "Last frame", keyframe: "Keyframe", storyboard: "Storyboard",
  motion: "Motion", camera: "Camera", continue: "Continue", structure: "Structure", voice: "Voice", copy: "Copy", lock: "Lock",
  music_style: "Music style", rhythm: "Rhythm", sound_reference: "Sound", style: "Style", rule: "Rule", character: "Character", world: "World",
  scene: "Scene", dialogue: "Dialogue", constraint: "Constraint", instruction: "Instruction" };
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
      h("span", { class: "h3s-lbl" }, "Describe what should happen. Nothing else is needed."), h("span", { class: "h3s-grow" }),
      h("button", { class: "h3s-btn ai", disabled: !S.ai || Boolean(S.busy), onclick: actions.splitPrompt,
        title: S.ai ? "The AI suggests shots; you accept or discard them." : "Connect an H3 AI Loader to the Connector for this." },
        icon("spark"), S.busy === "split" ? "AI working …" : "AI: split into shots"),
      S.busy === "split" ? h("button", { class: "h3s-btn ghost", onclick: actions.cancelAI }, "Cancel") : null,
      h("button", { class: "h3s-btn", onclick: actions.promptAsShot }, "Whole prompt = one shot")),
    h("textarea", { class: "h3s-in", id: "h3s-prompt", rows: 3, value: S.values.idea || "", placeholder: "A young woman plays outside with a red ball …",
      oninput: (event) => actions.setWidget("idea", event.target.value, false) }));
}

export function contentView(S, actions) {
  const selectedShot = S.selected?.kind === "shot" ? S.shots.find((shot) => shot.id === S.selected.id) : null;
  const drag = (id) => (event) => { actions.setDragged(id); try { event.dataTransfer.setData("text/plain", id); event.dataTransfer.effectAllowed = "copy"; } catch {} };
  const cards = [h("button", { class: "h3s-ctx", draggable: true, ondragstart: drag("__text"), ondragend: actions.endDrag,
    onclick: () => actions.newShot(null, "__text"), title: "Empty shot with text only" },
    h("div", { class: "h3s-ctx-visual", style: { color: "#9AA4B5", background: "#121722" } }, icon("plus", 24)),
    h("div", { class: "h3s-ctx-text" }, h("span", { class: "h3s-strong" }, "Text-Shot"), h("span", { class: "h3s-lbl" }, "text only, no media")))];
  for (const entry of S.contexts) {
    const assigned = Boolean(selectedShot?.media.some((binding) => binding.context_id === entry.id));
    const unused = S.values.mode === "fl2va" && entry.media === "video";
    const tip = unused ? "Not used in First/last frame mode (FL2VA)" : entry.media === "audio"
      ? "Drag onto an audio lane = plays throughout · onto a shot = only in that shot"
      : selectedShot ? `Click: ${assigned ? "remove from" : "add to"} ${actions.shotLabel(selectedShot.id)}` : "Drag onto the timeline";
    cards.push(h("button", { class: `h3s-ctx${assigned ? " on" : ""}${unused ? " off" : ""}`, draggable: true, title: tip,
      ondragstart: drag(entry.id), ondragend: actions.endDrag, onclick: () => actions.toggleBinding(entry.id) },
      visual(entry, actions.thumb),
      assigned ? h("span", { class: "h3s-badge" }, "in shot") : null,
      h("div", { class: "h3s-ctx-text" }, h("span", { class: "h3s-strong", style: { display: "flex", alignItems: "center", gap: "6px" } },
        h("span", { class: "h3s-swatch", style: { background: entry.color } }), entry.name), h("span", { class: "h3s-lbl" }, `${entry.kind} · ${entry.role}`))));
  }
  cards.push(h("div", { class: "h3s-hint" }, S.contexts.length ? "More Content comes from Context nodes in the graph" : "No Content yet: connect Context nodes to the Context Connector. Text alone works too."));
  return h("section", { class: "h3s-card" },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-strong" }, "Content"),
      h("span", { class: "h3s-lbl" }, "Drag onto the timeline = new shot · drag onto a shot or click = assign · audio onto an audio lane")),
    h("div", { class: "h3s-content" }, cards));
}
