// Timeline: picture track with shots, free audio lanes and the render parts the plan produced.
// During a mouse drag only the dragged block is moved; the project is written once, on release.
import { h, icon } from "./h3s_dom.js";
import { dragTo, reorder, sorted, span, fmt, partColor, r1 } from "./h3s_model.js";

const MODE_SHORT = { lock: "locked", copy: "copy", ref: "reference" };
const DEFAULT_HINT = "Drag = move, or put before/after another shot · edges = length · 0.1 s grid";

function ticks(axis) {
  const step = axis <= 10 ? 1 : axis <= 30 ? 5 : axis <= 60 ? 10 : 20, out = [];
  for (let t = 0; t <= axis + 1e-9; t += step) out.push(t);
  return out;
}

export function timelineView(S, actions) {
  const axis = Math.max(S.duration, S.plan?.total_s || 0);
  const pct = (seconds) => `${seconds / axis * 100}%`;
  const info = h("span", { class: "h3s-lbl" }, DEFAULT_HINT);
  const beyond = () => axis - S.duration > 0.01 ? h("span", { class: "h3s-beyond", style: { left: pct(S.duration), width: pct(axis - S.duration) },
    title: `After the project end (${fmt(S.duration)}): H3 renders in fixed frame steps and delivers ${fmt(axis)}. Shots and audio end at ${fmt(S.duration)}.` }) : null;
  const grid = () => [...ticks(axis).map((t) => h("span", { class: "h3s-grid", style: { left: pct(t) } })), beyond()].filter(Boolean);
  const lane = (name, track) => h("div", { class: "h3s-lane" }, name, track);

  function secondsAt(event, track) {
    const box = track.getBoundingClientRect();
    return Math.max(0, Math.min(S.duration, r1((event.clientX - box.left) / box.width * axis)));
  }

  // kind "shot" or "clip"; items are the shots or the clips of one lane.
  function grab(event, kind, item, mode, items, track, block) {
    event.stopPropagation(); event.preventDefault();
    const drag = { id: item.id, mode, start: item.start, end: item.end, reorder: kind === "shot" && mode === "move" };
    const width = track.getBoundingClientRect().width, x0 = event.clientX, layout = sorted(items).map(({ id, start, end }) => ({ id, start, end }));
    const handle = event.currentTarget;
    let result = null;
    try { handle.setPointerCapture(event.pointerId); } catch {}
    actions.beginPointer();
    block.classList.add("drag");
    handle.onpointermove = (move) => {
      result = dragTo(items, drag, (move.clientX - x0) / width * axis, S.duration);
      const moved = result.items.find((entry) => entry.id === item.id);
      block.style.left = pct(moved.start); block.style.width = pct(moved.end - moved.start);
      if (kind === "shot" && result.target !== null) {
        const others = sorted(items.filter((entry) => entry.id !== item.id));
        info.textContent = result.target < others.length ? `Release: goes before ${actions.shotLabel(others[result.target].id)}. The other shots move up.`
          : `Release: goes to the end, after ${actions.shotLabel(others[others.length - 1].id)}.`;
      } else info.textContent = `${span(moved.start, moved.end)} · length ${fmt(moved.end - moved.start)}`;
    };
    // A lost capture (the window lost focus, the element was replaced) ends the drag like a release, so the Studio never stays frozen.
    handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = () => {
      handle.onpointermove = handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = null;
      block.classList.remove("drag");
      actions.endPointer();
      const moved = result?.items.find((entry) => entry.id === item.id);
      if (!moved || (moved.start === item.start && moved.end === item.end)) { actions.select(kind, item.id); return; }
      const changed = result.target !== null && kind === "shot" ? reorder(result.items, item.id, result.target, layout) : result.items;
      if (kind === "shot") actions.setShots(changed, item.id);
      else actions.setClips(changed.concat(S.audio.filter((clip) => clip.lane !== item.lane)), item.id);
    };
  }

  function dropZone(track, onDrop, overClass = "over") {
    const line = h("span", { class: "h3s-drop", hidden: true });
    track.append(line);
    track.ondragover = (event) => { event.preventDefault(); track.classList.add(overClass); line.hidden = false; line.style.left = pct(secondsAt(event, track)); };
    track.ondragleave = () => { track.classList.remove(overClass); line.hidden = true; };
    track.ondrop = (event) => { event.preventDefault(); track.classList.remove(overClass); line.hidden = true; onDrop(secondsAt(event, track), actions.takeDragged()); };
  }

  function shotBlock(shot, track) {
    const selected = S.selected?.kind === "shot" && S.selected.id === shot.id;
    const block = h("div", { class: selected ? "h3s-shot sel" : "h3s-shot", style: { left: pct(shot.start), width: pct(shot.end - shot.start) },
      title: shot.text || "No text yet" });
    const grip = (side) => h("span", { class: "h3s-grip", style: { [side]: 0 }, onpointerdown: (event) => grab(event, "shot", shot, side, S.shots, track, block) });
    block.onpointerdown = (event) => grab(event, "shot", shot, "move", S.shots, track, block);
    block.ondragover = (event) => { event.preventDefault(); event.stopPropagation(); };
    block.ondrop = (event) => { event.preventDefault(); event.stopPropagation(); actions.assign(shot.id, actions.takeDragged()); };
    const chips = shot.media.map((binding) => S.byId.get(binding.context_id)).filter(Boolean)
      .map((entry) => h("span", { class: "h3s-chip", style: { background: entry.bg, color: entry.color } }, entry.name));
    block.append(grip("left"),
      h("span", { class: "h3s-row", style: { gap: "8px", fontSize: "12px" } }, h("strong", {}, actions.shotLabel(shot.id)),
        h("span", { class: "h3s-muted", style: { fontFamily: "IBM Plex Mono, Consolas, monospace" } }, span(shot.start, shot.end)),
        S.suggestions[shot.id] ? h("span", { class: "h3s-chip", style: { background: "#3A2F66", color: "#E1D8FF" } }, "AI suggestion") : null),
      h("span", { class: "h3s-shot-text", style: { color: shot.text ? "#C9D1DE" : "#7F8A9C" } }, shot.text || "No text yet"),
      h("span", { class: "h3s-row", style: { gap: "4px", marginTop: "auto", flexWrap: "nowrap" } }, chips),
      grip("right"));
    return block;
  }

  function shotTrack() {
    const track = h("div", { class: S.ghosts.length ? "h3s-track ghosting" : "h3s-track", style: { height: "84px" } }, grid());
    dropZone(track, (sec, id) => actions.newShot(sec, id));
    if (!S.shots.length && !S.ghosts.length)
      track.append(h("div", { class: "h3s-empty" }, "No shots yet: drag Content here, use “+ Shot” or “Whole prompt = one shot”. Without shots the prompt carries the whole video."));
    for (const shot of sorted(S.shots)) track.append(shotBlock(shot, track));
    for (const ghost of S.ghosts)
      track.append(h("div", { class: "h3s-shot ghost", style: { left: pct(ghost.start), width: pct(ghost.end - ghost.start) } },
        h("span", { style: { fontSize: "12px", color: "#C9BBFF", fontWeight: 600 } }, `Suggestion · ${span(ghost.start, ghost.end)}`),
        h("span", { class: "h3s-shot-text", style: { color: "#C9BBFF" } }, [ghost.text, ...(ghost.spoken || []).map((line) => `“${line.text}”`)].join(" "))));
    return track;
  }

  function clipBlock(clip, items, track) {
    const entry = S.byId.get(clip.context_id), selected = S.selected?.kind === "clip" && S.selected.id === clip.id;
    const block = h("div", { class: selected ? "h3s-clip sel" : "h3s-clip", style: { left: pct(clip.start), width: pct(clip.end - clip.start),
      borderColor: selected ? undefined : entry?.color }, title: `${entry?.name || clip.context_id}: ${span(clip.start, clip.end)}, from ${fmt(clip.offset)} in the file` });
    const grip = (side) => h("span", { class: "h3s-grip", style: { [side]: 0 }, onpointerdown: (event) => grab(event, "clip", clip, side, items, track, block) });
    block.onpointerdown = (event) => grab(event, "clip", clip, "move", items, track, block);
    block.append(grip("left"), h("span", { class: "h3s-swatch", style: { background: entry?.color || "#B38CF5" } }),
      h("strong", {}, entry?.name || "Not connected"), h("span", { style: { color: "#B9ADD6" } }, `${MODE_SHORT[clip.mode]} · ${span(clip.start, clip.end)}`), grip("right"));
    return block;
  }

  function laneRow(laneId, index) {
    const items = S.audio.filter((clip) => clip.lane === laneId);
    const track = h("div", { class: "h3s-track", style: { height: "34px" } }, grid());
    dropZone(track, (sec, id) => actions.newClip(laneId, sec, id));
    if (!items.length) track.append(h("span", { class: "h3s-empty", style: { justifyContent: "flex-start", fontSize: "12px" } }, "empty · drag audio here"));
    for (const clip of sorted(items)) track.append(clipBlock(clip, items, track));
    const name = h("span", { class: "h3s-lane-name" }, h("span", { class: "h3s-swatch", style: { background: "#B38CF5" } }), `Audio ${index + 1}`,
      items.length ? null : h("button", { class: "h3s-btn ghost small", title: "Remove empty audio lane", "aria-label": "Remove empty audio lane",
        onclick: () => actions.removeLane(laneId) }, icon("close", 12)));
    return lane(name, track);
  }

  function newLaneRow() {
    const zone = h("button", { class: "h3s-lane-add", onclick: () => actions.addLane() }, icon("plus"), "New audio lane · drag audio here or click");
    zone.ondragover = (event) => { event.preventDefault(); zone.classList.add("over"); };
    zone.ondragleave = () => zone.classList.remove("over");
    zone.ondrop = (event) => { event.preventDefault(); zone.classList.remove("over"); actions.addLane(actions.takeDragged()); };
    return lane(h("span"), zone);
  }

  function partsRow() {
    const track = h("div", { class: "h3s-track", style: { height: "30px", border: 0 } });
    const chosen = S.selectedRange;
    for (const chunk of S.plan?.chunks || []) {
      const [color, bg] = partColor(chunk.index), hit = chosen && chosen[0] < chunk.end_s && chosen[1] > chunk.start_s;
      track.append(h("div", { class: "h3s-part", style: { left: pct(chunk.start_s), width: pct(chunk.end_s - chunk.start_s), borderColor: color, background: hit ? bg : "#141922" },
        title: `Part ${chunk.index + 1}: ${chunk.delivered_frames} frames${chunk.head_frames ? `, preceded by ${chunk.head_frames} frames of the previous part for continuity` : ""}` },
        h("span", { class: "h3s-swatch", style: { background: color } }), `Part ${chunk.index + 1} · ${span(chunk.start_s, chunk.end_s)}`));
    }
    if (!S.plan) track.append(h("span", { class: "h3s-empty", style: { fontSize: "12px" } }, S.planError || "Planning …"));
    return lane(h("span", { class: "h3s-lane-name" }, "Render parts"), track);
  }

  const ghostBanner = S.ghosts.length ? h("div", { class: "h3s-banner" },
    `AI suggestion: ${S.ghosts.length} shots from your prompt (dashed). ${S.shots.length ? `Accept replaces your ${S.shots.length} shots; audio lanes stay.` : "Nothing changes until you accept."}`, h("span", { class: "h3s-grow" }),
    h("button", { class: "h3s-btn ai", onclick: actions.acceptGhosts }, "Accept"), h("button", { class: "h3s-btn ghost", onclick: actions.dropGhosts }, "Discard")) : null;
  const summary = S.plan ? `${S.plan.chunks.length} ${S.plan.chunks.length === 1 ? "part" : "parts"}, delivers ${fmt(S.plan.total_s)} (${S.plan.total_frames} frames)` : "";

  return h("section", { class: "h3s-card", style: { gap: "6px" } },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-strong" }, "Shots"), info, h("span", { class: "h3s-grow" }),
      h("button", { class: "h3s-btn", onclick: () => actions.addShot() }, icon("plus"), "Shot")),
    ghostBanner,
    lane(h("span"), h("div", { class: "h3s-ruler" }, ticks(axis).map((t) => h("span", { class: "h3s-tick", style: { left: pct(t) } }, `${t} s`)))),
    lane(h("span", { class: "h3s-lane-name" }, h("span", { class: "h3s-swatch", style: { background: "#8FC1FF" } }), "Picture"), shotTrack()),
    h("div", { class: "h3s-row", style: { marginTop: "4px" } }, h("span", { class: "h3s-strong" }, "Audio"),
      h("span", { class: "h3s-lbl" }, "Drag audio Content onto a lane, move it, trim it at the edges. Runs independently of the shots."),
      h("span", { class: "h3s-grow" }), h("button", { class: "h3s-btn", onclick: () => actions.addLane() }, icon("plus"), "Audio lane")),
    S.lanes.map(laneRow), newLaneRow(),
    h("div", { class: "h3s-row", style: { marginTop: "4px" } }, h("span", { class: "h3s-lbl" }, "How H3 renders it (planned automatically)"),
      h("span", { class: "h3s-lbl", title: "H3 produces lengths in fixed frame steps (17·k+5 at 24 FPS)." }, summary)),
    partsRow());
}
