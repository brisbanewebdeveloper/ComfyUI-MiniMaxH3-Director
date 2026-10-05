// Fixed settings bar, its two fold-outs (picture size, further settings) and the prompt drawer per render part.
import { h, icon, field, select } from "./h3s_dom.js";
import { DURATIONS, fmt, partColor, chunkBudget } from "./h3s_model.js";
import { issueLine } from "./h3s_issues.js";
import { PRESET_GROUPS, ASPECTS, RESIZE, presetValue, nearestAspect, canvasInfo, isAuto, NATIVE_MP } from "./h3s_canvas.js";

const CONTINUITY = [["video_audio", "Continue picture and sound"], ["video", "Continue picture only"], ["none", "Hard cuts"]];
const STYLES = [["None", "No style"], ["Cinematic", "Cinematic"], ["Anime", "Anime"], ["Documentary", "Documentary"], ["Photorealistic", "Photorealistic"]];

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
    field("Aspect ratio", select([["", "–"], ...ASPECTS.map(([label]) => [label, label])], nearestAspect(width, height), actions.setAspect)),
    field("Megapixels", number(mp, actions.setMegapixels, { step: "0.05", min: "0.1", max: "8", style: { width: "88px" } })),
    field("Fit pictures", select(RESIZE, S.values.resize_method, (value) => actions.setWidget("resize_method", value))),
    field("Reference images", select([["match", "Like video (fast)"], ["max", "Large, 2048 px (more identity, slower)"]], S.values.ref_image_size,
      (value) => actions.setWidget("ref_image_size", value), { disabled: S.values.mode === "fl2va" })),
    h("span", { class: tone === "warn" ? "h3s-warn" : "h3s-muted", style: { flex: "1 1 260px", fontSize: "13px" } }, info));
}

function furtherMore(S, actions) {
  const v = S.values, set = (name) => (value) => actions.setWidget(name, value);
  const text = (name, label, placeholder) => field(label, h("input", { class: "h3s-in", type: "text", value: v[name] || "", placeholder,
    style: { width: "260px" }, oninput: (event) => actions.setWidget(name, event.target.value, false) }));
  return h("div", { class: "h3s-more" },
    field("Transition between render parts", select(CONTINUITY, v.continuity, set("continuity"))),
    field("Overlap", select(["5", "22", "39", "56"].map((frames) => [frames, `${frames} frames (${fmt(frames / 24)})`]), v.pin_frames, set("pin_frames"))),
    text("soundscape", "Ambience", "e.g. a quiet hum of ventilation"),
    text("music", "Music", "N/A = no music"),
    field("Style", select(STYLES, v.style, set("style"))),
    field("Shift video", number(v.shift_video, set("shift_video"), { step: "0.1", style: { width: "88px" } })),
    field("Shift audio", number(v.shift_audio, set("shift_audio"), { step: "0.1", style: { width: "88px" } })),
    field("Manual prompt (replaces the generated prompt of every part)", h("textarea", { class: "h3s-in", rows: 2, value: v.prompt_override || "",
      style: { width: "420px" }, oninput: (event) => actions.setWidget("prompt_override", event.target.value, false) })));
}

// Any length on the 0.1 s grid, the usual ones offered as suggestions; a music video takes the length of its song.
// A fixed list offered no 27 s, so a 27 s song could not set the project's length.
function durationField(S, actions) {
  const v = S.values, set = (value) => { if (value > 0) actions.setDuration(Math.min(3600, Math.round(value * 10) / 10)); };
  const song = S.contexts.filter((entry) => entry.media === "audio" && S.lengths.get(entry.id) > 0)
    .sort((a, b) => S.lengths.get(b.id) - S.lengths.get(a.id))[0];
  const length = song && Math.round(S.lengths.get(song.id) * 10) / 10;
  return field("Duration", h("span", { class: "h3s-row", style: { gap: "6px", flexWrap: "nowrap" } },
    number(v.project_seconds, set, { min: "0.5", max: "3600", step: "0.1", list: "h3s-durations", "aria-label": "Duration in seconds", style: { width: "84px" } }),
    h("datalist", { id: "h3s-durations" }, DURATIONS.map((d) => h("option", { value: String(d) }))),
    song && length !== Number(v.project_seconds) ? h("button", { class: "h3s-btn small", title: `Set the duration to the length of ${song.name} (${fmt(length)})`,
      onclick: () => set(length) }, `= ${song.name}`) : null));
}

export function footerView(S, actions) {
  const v = S.values;
  const parts = withCurrent([["0", "Auto"], ["5", "5 s"], ["8", "8 s"], ["10", "10 s"]], v.chunk_seconds, (d) => fmt(Number(d)));
  const presets = [["auto", "From first picture (H3 chooses)"], ...PRESET_GROUPS.map(([group, list]) => ({ group, items: list.map(([label, w, hh]) => [`${w}x${hh}`, `${label} · ${w}×${hh}`]) })),
    ["custom", "Custom size"]];
  const sampler = (S.options.sampler_name || [v.sampler_name]).map((value) => [value, value]);
  const scheduler = (S.options.scheduler || [v.scheduler]).map((value) => [value, value]);
  const toggle = (key, label, iconName) => h("button", { class: "h3s-btn", "aria-expanded": String(S[key]), onclick: () => actions.toggle(key) },
    h("span", { style: { display: "inline-flex", transform: `rotate(${S[key] ? 90 : 0}deg)` } }, icon(iconName)), label);
  const plan = S.plan, size = isAuto(v.width, v.height) ? (plan ? `${plan.width}×${plan.height} from picture` : "size from picture") : `${v.width}×${v.height}`;
  const row = (title, ...children) => h("div", { class: "h3s-foot-row" }, h("span", { class: "h3s-foot-title" }, title), ...children);
  return h("footer", { class: "h3s-foot" },
    row("Video",
    durationField(S, actions),
    field("Render part", select(parts, String(v.chunk_seconds), (value) => actions.setWidget("chunk_seconds", Number(value)))),
    field("Resolution", select(presets, presetValue(v.width, v.height), actions.setPreset, { style: { maxWidth: "240px" } })),
    field("Width", number(isAuto(v.width, v.height) ? "" : v.width, (value) => actions.setSize("width", value), { step: "32", min: "0", placeholder: "auto", style: { width: "88px" } })),
    field("Height", number(isAuto(v.width, v.height) ? "" : v.height, (value) => actions.setSize("height", value), { step: "32", min: "0", placeholder: "auto", style: { width: "88px" } })),
    toggle("sizeOpen", "Picture size", "chevron"),
    field("FPS", h("span", { class: "h3s-in h3s-muted", style: { display: "flex", alignItems: "center" }, title: "H3 works natively at 24 FPS" }, "24 · H3")),
    h("span", { class: "h3s-grow" }),
    h("span", { class: "h3s-strong" }, `${fmt(v.project_seconds)} · ${S.shots.length} shot${S.shots.length === 1 ? "" : "s"} · ${plan ? plan.chunks.length : "?"} render part${plan?.chunks.length === 1 ? "" : "s"} · ${size}`)),
    row("Sampling",
    field("Seed", h("span", { class: "h3s-row", style: { gap: "6px", flexWrap: "nowrap" } }, number(v.seed, (value) => actions.setWidget("seed", value), { style: { width: "130px" } }),
      h("button", { class: "h3s-btn", title: "Random seed", "aria-label": "Random seed", onclick: () => actions.setWidget("seed", Math.floor(Math.random() * 1e9)) }, icon("dice")))),
    field("Steps", number(v.steps, (value) => actions.setWidget("steps", Math.max(1, Math.min(100, Math.round(value) || 1))), { min: "1", max: "100", style: { width: "80px" } })),
    field("Sampler", select(sampler, v.sampler_name, (value) => actions.setWidget("sampler_name", value))),
    field("Scheduler", select(scheduler, v.scheduler, (value) => actions.setWidget("scheduler", value))),
    toggle("furtherOpen", "More settings", "chevron"),
    h("span", { class: "h3s-grow" }),
    h("span", { class: "h3s-lbl" }, `${v.mode === "fl2va" ? "FL2VA" : v.mode === "ref2va" ? "Ref2VA" : "Auto"}${v.turbo ? " Turbo" : ""} · 24 FPS · ${v.steps} steps · CFG 1 · ${v.sampler_name}`)),
    S.sizeOpen ? sizeMore(S, actions) : null,
    S.furtherOpen ? furtherMore(S, actions) : null);
}

export function drawerView(S, actions) {
  const chunks = S.plan?.chunks || [], issues = S.plan?.issues || [];
  const head = h("button", { class: "h3s-drawer-head", "aria-expanded": String(S.promptOpen), onclick: () => actions.toggle("promptOpen") },
    h("span", { style: { display: "inline-flex", color: "#9AA4B5", transform: `rotate(${S.promptOpen ? 90 : 0}deg)` } }, icon("chevron")),
    h("span", { class: "h3s-strong" }, "Prompts per render part"),
    chunks.map((chunk) => { const [color] = partColor(chunk.index);
      return h("span", { class: "h3s-chip", style: { border: `1px solid ${color}`, display: "inline-flex", alignItems: "center", gap: "6px" } },
        h("span", { class: "h3s-swatch", style: { background: color } }), `Part ${chunk.index + 1}`); }),
    issues.length ? h("span", { class: "h3s-chip h3s-warn", style: { border: "1px solid #6B4A2E" } }, `${issues.length} note${issues.length === 1 ? "" : "s"}`) : null,
    h("span", { class: "h3s-lbl" }, "Exactly the prompt that goes to the sampler."));
  if (!S.promptOpen) return h("section", { class: "h3s-drawer" }, head);
  return h("section", { class: "h3s-drawer" }, head,
    issues.length ? h("div", { class: "h3s-issues", style: { padding: "0 20px 12px" } },
      issues.map((issue) => h("span", {}, `⚠ ${issueLine(issue)}`))) : null,
    h("div", { class: "h3s-prompts" }, chunks.map((chunk) => {
      const [color, bg] = partColor(chunk.index), use = chunkBudget(chunk);
      return h("div", { class: "h3s-prompt", style: { borderColor: color } },
        h("div", { class: "h3s-prompt-head", style: { background: bg } }, h("span", { class: "h3s-swatch", style: { background: color, width: "10px", height: "10px" } }),
          h("strong", {}, `Part ${chunk.index + 1}`), h("span", { class: "h3s-muted", style: { fontSize: "12px" } }, `${fmt(chunk.start_s)} – ${fmt(chunk.end_s)}`),
          h("span", { class: "h3s-grow" }), h("span", { class: "h3s-lbl" }, chunk.mode.toUpperCase())),
        h("span", { class: "h3s-lbl", style: { padding: "6px 12px 0" }, title: "Reference slots H3 gets in this part (the model's limits)" },
          `Images ${use.image}/9 · Video ${use.video}/3 · Audio ${use.audio}/3 · total ${use.total}/12`),
        h("pre", {}, chunk.prompt));
    })));
}
