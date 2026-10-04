// Timeline: picture track with shots, free audio lanes and the render parts the plan produced.
// During a mouse drag only the dragged block is moved; the project is written once, on release.
import { h, icon } from "./h3s_dom.js";
import { dragTo, reorder, sorted, span, fmt, partColor, r1 } from "./h3s_model.js";

const MODE_SHORT = { lock: "fest", copy: "übernehmen", ref: "Vorbild" };
const DEFAULT_HINT = "Ziehen = verschieben oder vor/hinter einen anderen Shot setzen · Kanten = Länge · Raster 0,1 s";

function ticks(axis) {
  const step = axis <= 10 ? 1 : axis <= 30 ? 5 : axis <= 60 ? 10 : 20, out = [];
  for (let t = 0; t <= axis + 1e-9; t += step) out.push(t);
  return out;
}

export function timelineView(S, actions) {
  const axis = Math.max(S.duration, S.plan?.total_s || 0);
  const pct = (seconds) => `${seconds / axis * 100}%`;
  const info = h("span", { class: "h3s-lbl" }, DEFAULT_HINT);
  const grid = () => ticks(axis).map((t) => h("span", { class: "h3s-grid", style: { left: pct(t) } }));
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
        info.textContent = result.target < others.length ? `Loslassen: kommt vor ${actions.shotLabel(others[result.target].id)}. Die anderen Shots rücken nach.`
          : `Loslassen: kommt ans Ende, hinter ${actions.shotLabel(others[others.length - 1].id)}.`;
      } else info.textContent = `${span(moved.start, moved.end)} · Länge ${fmt(moved.end - moved.start)}`;
    };
    handle.onpointerup = handle.onpointercancel = () => {
      handle.onpointermove = handle.onpointerup = handle.onpointercancel = null;
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
      title: shot.text || "Noch kein Text" });
    const grip = (side) => h("span", { class: "h3s-grip", style: { [side]: 0 }, onpointerdown: (event) => grab(event, "shot", shot, side, S.shots, track, block) });
    block.onpointerdown = (event) => grab(event, "shot", shot, "move", S.shots, track, block);
    block.ondragover = (event) => { event.preventDefault(); event.stopPropagation(); };
    block.ondrop = (event) => { event.preventDefault(); event.stopPropagation(); actions.assign(shot.id, actions.takeDragged()); };
    const chips = shot.media.map((binding) => S.byId.get(binding.context_id)).filter(Boolean)
      .map((entry) => h("span", { class: "h3s-chip", style: { background: entry.bg, color: entry.color } }, entry.name));
    block.append(grip("left"),
      h("span", { class: "h3s-row", style: { gap: "8px", fontSize: "12px" } }, h("strong", {}, actions.shotLabel(shot.id)),
        h("span", { class: "h3s-muted", style: { fontFamily: "IBM Plex Mono, Consolas, monospace" } }, span(shot.start, shot.end)),
        S.suggestions[shot.id] ? h("span", { class: "h3s-chip", style: { background: "#3A2F66", color: "#E1D8FF" } }, "KI-Vorschlag") : null),
      h("span", { class: "h3s-shot-text", style: { color: shot.text ? "#C9D1DE" : "#7F8A9C" } }, shot.text || "Noch kein Text"),
      h("span", { class: "h3s-row", style: { gap: "4px", marginTop: "auto", flexWrap: "nowrap" } }, chips),
      grip("right"));
    return block;
  }

  function shotTrack() {
    const track = h("div", { class: S.ghosts.length ? "h3s-track ghosting" : "h3s-track", style: { height: "84px" } }, grid());
    dropZone(track, (sec, id) => actions.newShot(sec, id));
    if (!S.shots.length && !S.ghosts.length)
      track.append(h("div", { class: "h3s-empty" }, "Noch keine Shots: Content hierher ziehen, „+ Shot“ oder „Ganzer Prompt = ein Shot“. Ohne Shots trägt der Prompt das ganze Video."));
    for (const ghost of S.ghosts)
      track.append(h("div", { class: "h3s-shot ghost", style: { left: pct(ghost.start), width: pct(ghost.end - ghost.start) } },
        h("span", { style: { fontSize: "12px", color: "#C9BBFF", fontWeight: 600 } }, `Vorschlag · ${span(ghost.start, ghost.end)}`),
        h("span", { class: "h3s-shot-text", style: { color: "#C9BBFF" } }, ghost.text)));
    for (const shot of sorted(S.shots)) track.append(shotBlock(shot, track));
    return track;
  }

  function clipBlock(clip, items, track) {
    const entry = S.byId.get(clip.context_id), selected = S.selected?.kind === "clip" && S.selected.id === clip.id;
    const block = h("div", { class: selected ? "h3s-clip sel" : "h3s-clip", style: { left: pct(clip.start), width: pct(clip.end - clip.start),
      borderColor: selected ? undefined : entry?.color }, title: `${entry?.name || clip.context_id}: ${span(clip.start, clip.end)}, ab ${fmt(clip.offset)} im File` });
    const grip = (side) => h("span", { class: "h3s-grip", style: { [side]: 0 }, onpointerdown: (event) => grab(event, "clip", clip, side, items, track, block) });
    block.onpointerdown = (event) => grab(event, "clip", clip, "move", items, track, block);
    block.append(grip("left"), h("span", { class: "h3s-swatch", style: { background: entry?.color || "#B38CF5" } }),
      h("strong", {}, entry?.name || "Nicht verbunden"), h("span", { style: { color: "#B9ADD6" } }, `${MODE_SHORT[clip.mode]} · ${span(clip.start, clip.end)}`), grip("right"));
    return block;
  }

  function laneRow(laneId, index) {
    const items = S.audio.filter((clip) => clip.lane === laneId);
    const track = h("div", { class: "h3s-track", style: { height: "34px" } }, grid());
    dropZone(track, (sec, id) => actions.newClip(laneId, sec, id));
    if (!items.length) track.append(h("span", { class: "h3s-empty", style: { justifyContent: "flex-start", fontSize: "12px" } }, "leer · Audio hierher ziehen"));
    for (const clip of sorted(items)) track.append(clipBlock(clip, items, track));
    const name = h("span", { class: "h3s-lane-name" }, h("span", { class: "h3s-swatch", style: { background: "#B38CF5" } }), `Ton ${index + 1}`,
      items.length ? null : h("button", { class: "h3s-btn ghost small", title: "Leere Tonspur entfernen", "aria-label": "Leere Tonspur entfernen",
        onclick: () => actions.removeLane(laneId) }, icon("close", 12)));
    return lane(name, track);
  }

  function newLaneRow() {
    const zone = h("button", { class: "h3s-lane-add", onclick: () => actions.addLane() }, icon("plus"), "Neue Tonspur · Audio hierher ziehen oder klicken");
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
        title: `Teil ${chunk.index + 1}: ${chunk.delivered_frames} Frames${chunk.head_frames ? `, davor ${chunk.head_frames} Frames vom vorherigen Teil zur Fortsetzung` : ""}` },
        h("span", { class: "h3s-swatch", style: { background: color } }), `Teil ${chunk.index + 1} · ${span(chunk.start_s, chunk.end_s)}`));
    }
    if (!S.plan) track.append(h("span", { class: "h3s-empty", style: { fontSize: "12px" } }, S.planError || "Plan wird berechnet …"));
    return lane(h("span", { class: "h3s-lane-name" }, "Render-Teile"), track);
  }

  const ghostBanner = S.ghosts.length ? h("div", { class: "h3s-banner" },
    `KI-Vorschlag: ${S.ghosts.length} Shots aus deinem Prompt (gestrichelt). ${S.shots.length ? `Übernehmen ersetzt deine ${S.shots.length} Shots; Tonspuren bleiben.` : "Nichts ändert sich, bis du übernimmst."}`, h("span", { class: "h3s-grow" }),
    h("button", { class: "h3s-btn ai", onclick: actions.acceptGhosts }, "Übernehmen"), h("button", { class: "h3s-btn ghost", onclick: actions.dropGhosts }, "Verwerfen")) : null;
  const summary = S.plan ? `${S.plan.chunks.length} ${S.plan.chunks.length === 1 ? "Teil" : "Teile"}, geliefert ${fmt(S.plan.total_s)} (${S.plan.total_frames} Frames)` : "";

  return h("section", { class: "h3s-card", style: { gap: "6px" } },
    h("div", { class: "h3s-row" }, h("span", { class: "h3s-strong" }, "Shots"), info, h("span", { class: "h3s-grow" }),
      h("button", { class: "h3s-btn", onclick: () => actions.newShot(sorted(S.shots).at(-1)?.end ?? 0, "__text") }, icon("plus"), "Shot")),
    ghostBanner,
    lane(h("span"), h("div", { class: "h3s-ruler" }, ticks(axis).map((t) => h("span", { class: "h3s-tick", style: { left: pct(t) } }, `${t} s`)))),
    lane(h("span", { class: "h3s-lane-name" }, h("span", { class: "h3s-swatch", style: { background: "#8FC1FF" } }), "Bild"), shotTrack()),
    h("div", { class: "h3s-row", style: { marginTop: "4px" } }, h("span", { class: "h3s-strong" }, "Ton"),
      h("span", { class: "h3s-lbl" }, "Audio-Content auf eine Spur ziehen, verschieben, an den Kanten kürzen. Läuft unabhängig von den Shots."),
      h("span", { class: "h3s-grow" }), h("button", { class: "h3s-btn", onclick: () => actions.addLane() }, icon("plus"), "Tonspur")),
    S.lanes.map(laneRow), newLaneRow(),
    h("div", { class: "h3s-row", style: { marginTop: "4px" } }, h("span", { class: "h3s-lbl" }, "So rendert H3 (automatisch geplant)"),
      h("span", { class: "h3s-lbl", title: "H3 erzeugt Längen in festen Frame-Schritten (17·k+5 bei 24 FPS)." }, summary)),
    partsRow());
}
