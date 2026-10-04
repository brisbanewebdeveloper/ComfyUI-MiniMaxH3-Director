// Fixed settings bar, its two fold-outs (picture size, further settings) and the prompt drawer per render part.
import { h, icon, field, select } from "./h3s_dom.js";
import { DURATIONS, fmt, partColor, chunkBudget } from "./h3s_model.js";
import { issueLine } from "./h3s_issues.js";
import { PRESET_GROUPS, ASPECTS, RESIZE, presetValue, nearestAspect, canvasInfo, isAuto, NATIVE_MP } from "./h3s_canvas.js";

const CONTINUITY = [["video_audio", "Bild und Ton fortsetzen"], ["video", "Nur Bild fortsetzen"], ["none", "Harte Schnitte"]];
const STYLES = [["None", "Kein Stil"], ["Cinematic", "Kinofilm"], ["Anime", "Anime"], ["Documentary", "Dokumentation"], ["Photorealistic", "Fotorealistisch"]];

function withCurrent(options, value, label) {
  return options.some(([v]) => String(v) === String(value)) ? options : [...options, [String(value), label(value)]];
}

function number(value, onchange, props = {}) {
  return h("input", { class: "h3s-in", type: "number", value, onchange: (event) => onchange(Number(event.target.value)), ...props });
}

function sizeMore(S, actions) {
  const { width, height } = S.values, [info, tone] = canvasInfo(width, height);
  const mp = (isAuto(width, height) ? NATIVE_MP : width * height / 1e6).toFixed(2);
  return h("div", { class: "h3s-more" },
    field("Seitenverhältnis", select([["", "–"], ...ASPECTS.map(([label]) => [label, label])], nearestAspect(width, height), actions.setAspect)),
    field("Megapixel", number(mp, actions.setMegapixels, { step: "0.05", min: "0.1", max: "8", style: { width: "88px" } })),
    field("Bilder einpassen", select(RESIZE, S.values.resize_method, (value) => actions.setWidget("resize_method", value))),
    field("Referenzbilder", select([["match", "Wie Video (schnell)"], ["max", "Groß, 2048 px (mehr Identität, langsamer)"]], S.values.ref_image_size,
      (value) => actions.setWidget("ref_image_size", value), { disabled: S.values.mode === "fl2va" })),
    h("span", { class: tone === "warn" ? "h3s-warn" : "h3s-muted", style: { flex: "1 1 260px", fontSize: "13px" } }, info));
}

function furtherMore(S, actions) {
  const v = S.values, set = (name) => (value) => actions.setWidget(name, value);
  const text = (name, label, placeholder) => field(label, h("input", { class: "h3s-in", type: "text", value: v[name] || "", placeholder,
    style: { width: "260px" }, oninput: (event) => actions.setWidget(name, event.target.value, false) }));
  return h("div", { class: "h3s-more" },
    field("Übergang zwischen Render-Teilen", select(CONTINUITY, v.continuity, set("continuity"))),
    field("Überlappung", select(["5", "22", "39", "56"].map((frames) => [frames, `${frames} Frames (${fmt(frames / 24)})`]), v.pin_frames, set("pin_frames"))),
    text("soundscape", "Umgebungston", "z. B. leises Brummen der Lüftung"),
    text("music", "Musik", "N/A = keine Musik"),
    field("Stil", select(STYLES, v.style, set("style"))),
    field("Shift Bild", number(v.shift_video, set("shift_video"), { step: "0.1", style: { width: "88px" } })),
    field("Shift Ton", number(v.shift_audio, set("shift_audio"), { step: "0.1", style: { width: "88px" } })),
    field("Prompt von Hand (ersetzt den erzeugten Prompt jedes Teils)", h("textarea", { class: "h3s-in", rows: 2, value: v.prompt_override || "",
      style: { width: "420px" }, oninput: (event) => actions.setWidget("prompt_override", event.target.value, false) })));
}

export function footerView(S, actions) {
  const v = S.values;
  const durations = withCurrent(DURATIONS.map((d) => [String(d), `${d} s`]), v.project_seconds, (d) => fmt(Number(d)));
  const parts = withCurrent([["0", "Auto"], ["5", "5 s"], ["8", "8 s"], ["10", "10 s"]], v.chunk_seconds, (d) => fmt(Number(d)));
  const presets = [["auto", "Aus erstem Bild (H3 wählt)"], ...PRESET_GROUPS.map(([group, list]) => ({ group, items: list.map(([label, w, hh]) => [`${w}x${hh}`, `${label} · ${w}×${hh}`]) })),
    ["custom", "Eigene Größe"]];
  const sampler = (S.options.sampler_name || [v.sampler_name]).map((value) => [value, value]);
  const scheduler = (S.options.scheduler || [v.scheduler]).map((value) => [value, value]);
  const toggle = (key, label, iconName) => h("button", { class: "h3s-btn", "aria-expanded": String(S[key]), onclick: () => actions.toggle(key) },
    h("span", { style: { display: "inline-flex", transform: `rotate(${S[key] ? 90 : 0}deg)` } }, icon(iconName)), label);
  const plan = S.plan, size = isAuto(v.width, v.height) ? (plan ? `${plan.width}×${plan.height} aus Bild` : "Größe aus Bild") : `${v.width}×${v.height}`;
  return h("footer", { class: "h3s-foot" },
    field("Dauer", select(durations, String(v.project_seconds), (value) => actions.setDuration(Number(value)))),
    field("Render-Teil", select(parts, String(v.chunk_seconds), (value) => actions.setWidget("chunk_seconds", Number(value)))),
    field("Auflösung", select(presets, presetValue(v.width, v.height), actions.setPreset, { style: { maxWidth: "240px" } })),
    field("Breite", number(isAuto(v.width, v.height) ? "" : v.width, (value) => actions.setSize("width", value), { step: "32", min: "0", placeholder: "auto", style: { width: "88px" } })),
    field("Höhe", number(isAuto(v.width, v.height) ? "" : v.height, (value) => actions.setSize("height", value), { step: "32", min: "0", placeholder: "auto", style: { width: "88px" } })),
    toggle("sizeOpen", "Bildgröße", "chevron"),
    field("FPS", h("span", { class: "h3s-in h3s-muted", style: { display: "flex", alignItems: "center" }, title: "H3 arbeitet nativ mit 24 FPS" }, "24 · H3")),
    h("span", { style: { width: "1px", alignSelf: "stretch", background: "#2A3342" } }),
    field("Seed", h("span", { class: "h3s-row", style: { gap: "6px", flexWrap: "nowrap" } }, number(v.seed, (value) => actions.setWidget("seed", value), { style: { width: "130px" } }),
      h("button", { class: "h3s-btn", title: "Zufälliger Seed", "aria-label": "Zufälliger Seed", onclick: () => actions.setWidget("seed", Math.floor(Math.random() * 1e9)) }, icon("dice")))),
    field("Steps", number(v.steps, (value) => actions.setWidget("steps", Math.max(1, Math.min(100, Math.round(value) || 1))), { min: "1", max: "100", style: { width: "80px" } })),
    field("Sampler", select(sampler, v.sampler_name, (value) => actions.setWidget("sampler_name", value))),
    field("Scheduler", select(scheduler, v.scheduler, (value) => actions.setWidget("scheduler", value))),
    toggle("furtherOpen", "Weitere Einstellungen", "chevron"),
    h("span", { class: "h3s-grow" }),
    h("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" } },
      h("span", { class: "h3s-strong" }, `${fmt(v.project_seconds)} · ${S.shots.length} Shots · ${plan ? plan.chunks.length : "?"} Render-Teil${plan?.chunks.length === 1 ? "" : "e"}`),
      h("span", { class: "h3s-lbl" }, `${v.mode === "fl2va" ? "FL2VA" : v.mode === "ref2va" ? "Ref2VA" : "Auto"}${v.turbo ? " Turbo" : ""} · ${size} · 24 FPS · ${v.steps} Steps · CFG 1 · ${v.sampler_name}`)),
    S.sizeOpen ? sizeMore(S, actions) : null,
    S.furtherOpen ? furtherMore(S, actions) : null);
}

export function drawerView(S, actions) {
  const chunks = S.plan?.chunks || [], issues = S.plan?.issues || [];
  const head = h("button", { class: "h3s-drawer-head", "aria-expanded": String(S.promptOpen), onclick: () => actions.toggle("promptOpen") },
    h("span", { style: { display: "inline-flex", color: "#9AA4B5", transform: `rotate(${S.promptOpen ? 90 : 0}deg)` } }, icon("chevron")),
    h("span", { class: "h3s-strong" }, "Prompts je Render-Teil"),
    chunks.map((chunk) => { const [color] = partColor(chunk.index);
      return h("span", { class: "h3s-chip", style: { border: `1px solid ${color}`, display: "inline-flex", alignItems: "center", gap: "6px" } },
        h("span", { class: "h3s-swatch", style: { background: color } }), `Teil ${chunk.index + 1}`); }),
    issues.length ? h("span", { class: "h3s-chip h3s-warn", style: { border: "1px solid #6B4A2E" } }, `${issues.length} Hinweis${issues.length === 1 ? "" : "e"}`) : null,
    h("span", { class: "h3s-lbl" }, "Genau der Prompt, der an den Sampler geht."));
  if (!S.promptOpen) return h("section", { class: "h3s-drawer" }, head);
  return h("section", { class: "h3s-drawer" }, head,
    issues.length ? h("div", { class: "h3s-issues", style: { padding: "0 20px 12px" } },
      issues.map((issue) => h("span", {}, `⚠ ${issueLine(issue)}`))) : null,
    h("div", { class: "h3s-prompts" }, chunks.map((chunk) => {
      const [color, bg] = partColor(chunk.index), use = chunkBudget(chunk);
      return h("div", { class: "h3s-prompt", style: { borderColor: color } },
        h("div", { class: "h3s-prompt-head", style: { background: bg } }, h("span", { class: "h3s-swatch", style: { background: color, width: "10px", height: "10px" } }),
          h("strong", {}, `Teil ${chunk.index + 1}`), h("span", { class: "h3s-muted", style: { fontSize: "12px" } }, `${fmt(chunk.start_s)} – ${fmt(chunk.end_s)}`),
          h("span", { class: "h3s-grow" }), h("span", { class: "h3s-lbl" }, chunk.mode.toUpperCase())),
        h("span", { class: "h3s-lbl", style: { padding: "6px 12px 0" }, title: "Plätze für Vorbilder, die H3 in diesem Teil bekommt (Grenzen des Modells)" },
          `Bilder ${use.image}/9 · Video ${use.video}/3 · Ton ${use.audio}/3 · zusammen ${use.total}/12`),
        h("pre", {}, chunk.prompt));
    })));
}
