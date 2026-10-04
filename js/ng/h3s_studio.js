// The full-screen Studio over the graph. It reads and writes the Director node's own widgets, so saving,
// loading and queueing stay ComfyUI's; the shot document keeps shots, audio clips and lanes in the shots widget.
import { h, icon } from "./h3s_dom.js";
import { ensureStudioStyle } from "./h3s_style.js";
import { readProject, writeProject, newShot, newClip, newLane, placeAt, addShotAt, editSpoken, addSpoken, removeSpoken, sorted, clipToFit, MIN_LENGTH, r1, preferredTurboLora, fmt } from "./h3s_model.js";
import { fitAspect, snap32, ASPECTS, isAuto, NATIVE_MP } from "./h3s_canvas.js";
import { contentEntries, promptView, contentView } from "./h3s_content.js";
import { timelineView } from "./h3s_timeline.js";
import { sideView } from "./h3s_side.js";
import { footerView, drawerView } from "./h3s_footer.js";
import { studioAI } from "./h3s_ai.js";
import { values, applyValues, request } from "./ng_widgets.js";
import { readPayload, readContexts, connectedProvider } from "./ng_read.js";
import { contextColor } from "./ng_identity.js";
import { hasRenderPath, projectRenderIds } from "./ng_graph.js";
import { attachProgress } from "./ng_studio_progress.js";

const COMBOS = ["sampler_name", "scheduler", "turbo_lora_fl2va", "turbo_lora_ref2va"];
const open = new Map();

function load(S) {
  S.values = values(S.node);
  S.options = Object.fromEntries(COMBOS.map((name) => [name, S.node.widgets?.find((w) => w.name === name)?.options?.values]));
  S.contexts = contentEntries(readContexts(S.node), contextColor);
  S.byId = new Map(S.contexts.map((entry) => [entry.id, entry]));
  S.ai = Boolean(connectedProvider(S.node));
  const project = readProject(S.values.shots || "");
  S.docError = project.error;
  Object.assign(S, { shots: project.shots, audio: project.audio, lanes: project.lanes });
}

export function openStudio(node, app, api) {
  if (open.has(node.id)) { open.get(node.id).root.focus(); return; }
  ensureStudioStyle();
  const root = h("div", { class: "h3s", tabindex: "-1", role: "dialog", "aria-label": "H3 Director Studio" });
  const page = h("div", { class: "h3s-page" });
  root.append(page);
  const S = { node, root, selected: null, ghosts: [], ghostSound: null, suggestions: {}, plan: null, planError: "", promptOpen: false,
    sizeOpen: false, furtherOpen: false, busy: "", toast: "", notice: null, aiStarted: 0, aiTimeout: 0, dragged: null, dragging: false, pending: false, thumbs: new Map(), lengths: new Map() };
  load(S);
  let timer = null, serial = 0, toastTimer = null, tick = null, closed = false;
  const status = h("span", { class: "h3s-lbl" }), live = h("img", { class: "h3s-live", hidden: true, alt: "Live preview" });
  const progress = attachProgress(node, api, status, live, () => projectRenderIds(node));
  const ai = studioAI(S, app, api, () => render());

  let echo = false;
  function write(changes) { echo = true; try { applyValues(node, changes); } finally { echo = false; } }
  const labels = () => new Map(sorted(S.shots).map((shot, index) => [shot.id, `Shot ${index + 1}`]));
  function save() {
    const text = S.docError ? null : writeProject({ shots: S.shots, audio: S.audio, lanes: S.lanes });
    if (text !== null && text !== (values(node).shots || "")) { write({ shots: text }); node.graph?.change?.(); }
    S.values = values(node); schedulePlan();
  }
  function flash(message) {
    S.toast = message; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { S.toast = ""; render(); }, 3200);
  }
  function setWidget(name, value, rerender = true) {
    write({ [name]: value }); node.graph?.change?.();
    S.values = values(node); schedulePlan();
    if (rerender) render();
  }
  function schedulePlan() {
    clearTimeout(timer); const mine = ++serial;
    timer = setTimeout(async () => {
      try {
        const data = await request(api, "/ng/plan", readPayload(node));
        if (closed || mine !== serial) return;
        S.plan = data; S.planError = "";
        S.lengths = new Map((data.director_context?.items || []).map((item) => [item.id, item.length_s]));
      } catch (error) { if (closed || mine !== serial) return; S.plan = null; S.planError = error.message; }
      render();
    }, 250);
  }
  function thumb(entry) {
    if (!["image", "video"].includes(entry.media) || !entry.source) return "";
    const key = `${entry.media}|${entry.source}`;
    if (!S.thumbs.has(key)) {
      S.thumbs.set(key, "");
      request(api, "/ng/media?" + new URLSearchParams({ media: entry.media, source: entry.source }))
        .then((data) => { if (data.thumbnail?.startsWith("data:image/")) { S.thumbs.set(key, data.thumbnail); render(); } }).catch(() => {});
    }
    return S.thumbs.get(key);
  }
  function selectedRange() {
    const item = S.selected && (S.selected.kind === "shot" ? S.shots : S.audio).find((entry) => entry.id === S.selected.id);
    return item ? [item.start, item.end] : null;
  }
  function setItems(kind, items, selectId) {
    if (kind === "shot") S.shots = items; else S.audio = items;
    if (selectId) S.selected = { kind, id: selectId };
    save(); render();
  }
  function patchShot(id, change, rerender = true) {
    S.shots = S.shots.map((shot) => (shot.id === id ? { ...shot, ...change } : shot));
    save(); if (rerender) render();
  }
  function room(items, id) {
    const list = sorted(items), index = list.findIndex((entry) => entry.id === id);
    return [index > 0 ? list[index - 1].end : 0, index < list.length - 1 ? list[index + 1].start : S.values.project_seconds];
  }
  function timed(item, items, key, value) {
    const [prev, next] = room(items, item.id);
    if (!Number.isFinite(value)) return item;
    return key === "start" ? { ...item, start: r1(Math.max(prev, Math.min(value, item.end - MIN_LENGTH))) }
      : { ...item, end: r1(Math.min(next, Math.max(value, item.start + MIN_LENGTH))) };
  }

  const actions = {
    shotLabel: (id) => labels().get(id) || "Shot",
    select(kind, id) { S.selected = { kind, id }; render(); },
    setShots: (shots, id) => setItems("shot", shots, id),
    setClips: (audio, id) => setItems("clip", audio, id),
    setDragged(id) { S.dragged = id; },
    endDrag() { setTimeout(() => { S.dragged = null; }, 0); },
    takeDragged() { const id = S.dragged; S.dragged = null; return id; },
    beginPointer() { S.dragging = true; },
    endPointer() { S.dragging = false; if (S.pending) render(); },
    addShot() {
      const made = addShotAt(S.shots, S.selected?.kind === "shot" ? S.selected.id : null, S.values.project_seconds);
      if (!made) { flash("No room for a new shot: every shot is already at its shortest length."); return; }
      if (made.split) flash(`${actions.shotLabel(made.split)} was halved to make room for the new shot.`);
      setItems("shot", made.shots, made.id);
    },
    newShot(sec, id) {
      if (id === null) return;
      if (sec === null || sec === undefined) { if (id === "__text") { actions.addShot(); return; } sec = sorted(S.shots).at(-1)?.end ?? 0; }
      const at = placeAt(S.shots, sec, S.values.project_seconds, 4);
      if (!at) { flash("There is no room for a new shot there. Drop it on a free spot, or use + Shot."); return; }
      const media = id && id !== "__text" && S.byId.has(id) ? [id] : [];
      const shot = newShot(at.start, at.end, media);
      setItems("shot", [...S.shots, shot], shot.id);
    },
    assign(shotId, id) {
      if (!id || id === "__text" || !S.byId.has(id)) return;
      const shot = S.shots.find((entry) => entry.id === shotId);
      if (!shot.media.some((binding) => binding.context_id === id))
        patchShot(shotId, { media: [...shot.media, { schema_version: 1, context_id: id, role: "context" }] }, false);
      S.selected = { kind: "shot", id: shotId }; render();
    },
    unassign(shotId, id) {
      const shot = S.shots.find((entry) => entry.id === shotId);
      patchShot(shotId, { media: shot.media.filter((binding) => binding.context_id !== id) });
    },
    toggleBinding(id) {
      const shot = S.selected?.kind === "shot" && S.shots.find((entry) => entry.id === S.selected.id);
      if (!shot) { flash("Click a shot first, or drag the Content onto the timeline."); return; }
      if (shot.media.some((binding) => binding.context_id === id)) actions.unassign(shot.id, id); else actions.assign(shot.id, id);
    },
    newClip(lane, sec, id) {
      const entry = S.byId.get(id);
      if (!entry || entry.media !== "audio") { if (id) flash("Only audio Content goes on the audio lanes."); return; }
      const length = Math.min(S.lengths.get(id) || 8, S.values.project_seconds);
      const at = placeAt(S.audio.filter((clip) => clip.lane === lane), sec, S.values.project_seconds, length);
      if (!at) { flash("There is no room on this audio lane there."); return; }
      const clip = newClip(id, lane, at.start, at.end);
      setItems("clip", [...S.audio, clip], clip.id);
    },
    addLane(id) {
      const lane = newLane();
      S.lanes = [...S.lanes, lane];
      if (id && S.byId.get(id)?.media === "audio") actions.newClip(lane, 0, id);
      else { if (id) flash("Only audio Content goes on the audio lanes."); save(); render(); }
    },
    removeLane(lane) { S.lanes = S.lanes.filter((entry) => entry !== lane); save(); render(); },
    setWidget,
    setTurbo(on) {
      const loras = {};
      if (on) for (const [name, kind] of [["turbo_lora_fl2va", "fl2v"], ["turbo_lora_ref2va", "ref2v"]])
        if (S.values[name] === "none" || !S.values[name]) loras[name] = preferredTurboLora(S.options[name], kind);
      write({ turbo: on, steps: on ? 4 : 20, ...loras }); setWidget("turbo", on);
    },
    setDuration(seconds) {
      S.shots = clipToFit(S.shots, seconds); S.audio = clipToFit(S.audio, seconds); S.ghosts = [];
      write({ project_seconds: seconds }); save(); render();
    },
    setPreset(value) {
      if (value === "auto") write({ width: 0, height: 0 });
      else if (value !== "custom") { const [w, hh] = value.split("x").map(Number); write({ width: w, height: hh }); }
      else if (isAuto(S.values.width, S.values.height)) write({ width: 1344, height: 768 });
      setWidget("width", values(node).width);
    },
    setSize(name, value) {
      const other = name === "width" ? "height" : "width";
      if (!(value > 0)) { write({ width: 0, height: 0 }); setWidget("width", 0); return; }
      write({ [name]: snap32(value), [other]: S.values[other] > 0 ? S.values[other] : name === "width" ? 768 : 1344 });
      setWidget(name, values(node)[name]);
    },
    setAspect(label) {
      const ratio = ASPECTS.find(([name]) => name === label)?.[1]; if (!ratio) return;
      const pixels = isAuto(S.values.width, S.values.height) ? NATIVE_MP * 1e6 : S.values.width * S.values.height;
      const [w, hh] = fitAspect(pixels, ratio); write({ width: w, height: hh }); setWidget("width", w);
    },
    setMegapixels(mp) {
      if (!(mp > 0)) return;
      const ratio = isAuto(S.values.width, S.values.height) ? 1344 / 768 : S.values.width / S.values.height;
      const [w, hh] = fitAspect(mp * 1e6, ratio); write({ width: w, height: hh }); setWidget("width", w);
    },
    toggle(key) { S[key] = !S[key]; render(); },
    setShotTime(id, key, value) { const shot = S.shots.find((entry) => entry.id === id); patchShot(id, timed(shot, S.shots, key, value)); },
    setShotText(id, text) { patchShot(id, { text }, false); },
    deleteShot(id) { S.shots = S.shots.filter((shot) => shot.id !== id); S.selected = null; delete S.suggestions[id]; save(); render(); },
    setSpoken(id, index, change, rerender = true) { patchShot(id, { spoken: editSpoken(S.shots.find((entry) => entry.id === id).spoken, index, change) }, rerender); },
    addSpoken(id) { patchShot(id, { spoken: addSpoken(S.shots.find((entry) => entry.id === id).spoken) }); },
    removeSpoken(id, index) { patchShot(id, { spoken: removeSpoken(S.shots.find((entry) => entry.id === id).spoken, index) }); },
    suggest: (id) => ai.suggest(id),
    acceptSuggestion(id) { const text = S.suggestions[id]; delete S.suggestions[id]; patchShot(id, { text }); },
    dropSuggestion(id) { delete S.suggestions[id]; render(); },
    cancelAI: () => ai.cancel(),
    splitPrompt: () => ai.split(),
    promptAsShot() { const shot = newShot(0, S.values.project_seconds); shot.text = S.values.idea || ""; S.ghosts = []; setItems("shot", [shot], shot.id); },
    acceptGhosts() {
      const shots = S.ghosts.map((ghost) => ({ ...newShot(ghost.start, ghost.end), text: ghost.text }));
      const sound = S.ghostSound || {};
      for (const name of ["soundscape", "music"]) if (sound[name]?.trim()) write({ [name]: sound[name].trim() });
      S.ghosts = []; S.ghostSound = null; setItems("shot", shots, shots[0]?.id);
    },
    dropGhosts() { S.ghosts = []; S.ghostSound = null; render(); },
    setClip(id, key, value) {
      const clip = S.audio.find((entry) => entry.id === id), lane = S.audio.filter((entry) => entry.lane === clip.lane);
      const next = key === "mode" ? { ...clip, mode: value } : key === "offset" ? { ...clip, offset: Math.max(0, r1(value) || 0) } : timed(clip, lane, key, value);
      setItems("clip", S.audio.map((entry) => (entry.id === id ? next : entry)), id);
    },
    deleteClip(id) { S.audio = S.audio.filter((clip) => clip.id !== id); S.selected = null; save(); render(); },
    thumb,
  };

  function header() {
    const ready = hasRenderPath(node);
    return h("header", { class: "h3s-head" },
      h("button", { class: "h3s-btn ghost", onclick: close, title: "Back to the graph (Esc)" }, icon("back"), "Back to graph"),
      h("span", { style: { width: "1px", height: "24px", background: "#2A3342" } }),
      h("span", { class: "h3s-title" }, "H3 Director"), h("span", { class: "h3s-muted" }, "Studio"),
      h("span", { class: "h3s-grow" }), status, live,
      h("span", { class: "h3s-row", style: { gap: "6px" }, title: "Green when an H3 AI Loader is connected to the Context Connector" },
        h("span", { class: "h3s-swatch", style: { background: S.ai ? "#5BD08A" : "#6B7383", borderRadius: "50%" } }), S.ai ? "AI connected" : "AI off"),
      h("button", { class: "h3s-btn", onclick: () => actions.toggle("promptOpen") }, icon("doc"), S.promptOpen ? "Hide prompts" : "Show prompts"),
      h("button", { class: "h3s-btn go", disabled: !ready, title: ready ? "Queues the connected workflow in ComfyUI" :
        "Connect Director Output to H3 Render Sequence or a sampler and a video output", onclick: generate }, icon("play"), "Generate"));
  }
  function generate() {
    app.queuePrompt(0, 1);
    flash(`Queued: ${S.plan ? S.plan.chunks.length : "?"} render part(s). Progress at the top, result in the Save Video node.`);
    render();
  }

  function render() {
    if (closed) return;
    if (S.dragging) { S.pending = true; return; }
    S.pending = false; S.selectedRange = selectedRange(); S.duration = Number(S.values.project_seconds) || 1;
    // A redraw replaces the fields; the one being typed in gets its focus and caret back by its place among the fields.
    const fields = () => [...root.querySelectorAll("input,textarea,select")];
    const active = document.activeElement, before = fields(), index = before.indexOf(active);
    const caret = index >= 0 && typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null;
    const top = root.scrollTop;
    page.replaceChildren(...[header(),
      S.docError ? h("div", { class: "h3s-toast h3s-warn" }, `The saved shot data is invalid and is left unchanged: ${S.docError}`) : null,
      h("div", { class: "h3s-body" },
        h("main", { class: "h3s-main" }, promptView(S, actions), contentView(S, actions), timelineView(S, actions)),
        h("div", { class: "h3s-side" }, sideView(S, actions))),
      footerView(S, actions), drawerView(S, actions), floating()].filter(Boolean));
    clearInterval(tick); tick = S.busy ? setInterval(() => { const clock = root.querySelector(".h3s-ai-clock"); if (clock) clock.textContent = aiClock(); }, 1000) : null;
    root.scrollTop = top;
    const after = fields(), next = index >= 0 && after.length === before.length ? after[index] : null;
    if (next && next.tagName === active.tagName) {
      next.focus({ preventScroll: true });
      if (caret && next.setSelectionRange) try { next.setSelectionRange(...caret); } catch {}
    }
  }

  function refresh() { if (S.dragging) return; load(S); schedulePlan(); render(); }
  function aiClock() { return `${fmt(Math.floor((Date.now() - S.aiStarted) / 1000))} of at most ${fmt(S.aiTimeout)}`; }
  // Messages float over the bottom of the window, so they are seen wherever the Studio is scrolled to.
  function floating() {
    const items = [];
    if (S.busy) items.push(h("div", { class: "h3s-toast busy", role: "status" }, icon("spark"),
      h("span", {}, S.busy === "split" ? "AI is splitting the prompt into shots …" : "AI is writing a text for this shot …"),
      h("span", { class: "h3s-ai-clock h3s-muted" }, aiClock()), h("button", { class: "h3s-btn ghost small", onclick: actions.cancelAI }, "Cancel")));
    if (S.notice) items.push(h("div", { class: S.notice.error ? "h3s-toast error" : "h3s-toast", role: S.notice.error ? "alert" : "status" },
      h("span", {}, S.notice.text), h("button", { class: "h3s-btn ghost small", title: "Dismiss", "aria-label": "Dismiss",
        onclick: () => { S.notice = null; render(); } }, icon("close", 14))));
    if (S.toast) items.push(h("div", { class: "h3s-toast", role: "status" }, S.toast));
    return items.length ? h("div", { class: "h3s-float" }, items) : null;
  }
  function close() {
    closed = true; clearTimeout(timer); clearTimeout(toastTimer); clearInterval(tick); ai.dispose(); progress.dispose();
    document.removeEventListener("ng-context-changed", outside);
    open.delete(node.id); root.remove();
    document.dispatchEvent(new CustomEvent("ng-context-changed"));
  }
  // Changes from elsewhere (a Context node edited, a link changed) reach an open Studio, but not its own writes.
  function outside() { if (!echo) refresh(); }
  root.onkeydown = (event) => { if (event.key === "Escape" && !event.target.closest?.("select")) { event.stopPropagation(); close(); } };
  document.addEventListener("ng-context-changed", outside);
  document.body.append(root);
  open.set(node.id, { root, close, refresh });
  render(); schedulePlan(); root.focus();
  return { close, refresh };
}

export function closeStudio(node) { open.get(node.id)?.close(); }
