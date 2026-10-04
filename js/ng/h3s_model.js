// The Studio's data rules without a DOM: the shot document with audio lanes, mouse edits on a 0.1 s grid,
// render-part colours and the canvas presets. Everything here is checked with node (tests/ng/js/test_h3s_model.mjs).
import { readStory, createShot, SHOT_FORMAT } from "./ng_story_model.js";

export const GRID = 0.1;
export const MIN_LENGTH = 0.5;
export const CLIP_MODES = ["lock", "copy", "ref"];
export const DURATIONS = [5, 8, 10, 15, 20, 30, 60, 120];
export const PART_COLORS = [["#4FB8C4", "#12272B"], ["#E58A5C", "#2C1C14"], ["#9C8CE8", "#1E1A33"],
  ["#CFC05A", "#272514"], ["#6FBF73", "#16271A"], ["#E07A9B", "#2C1520"]];

export const r1 = (value) => Math.round(value * 10) / 10;
export function fmt(seconds) {
  const value = r1(seconds);
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace(".", ",")} s`;
}
export const span = (a, b) => `${fmt(a).replace(" s", "")}–${fmt(b)}`;
export const sorted = (items) => [...items].sort((x, y) => x.start - y.start);
export const partColor = (index) => PART_COLORS[index % PART_COLORS.length];

function uid(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
}

function readClip(clip) {
  const ok = clip && clip.schema_version === 1 && typeof clip.id === "string" && clip.id && typeof clip.context_id === "string"
    && clip.context_id && [clip.start, clip.end].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)
    && clip.end > clip.start && CLIP_MODES.includes(clip.mode ?? "ref");
  if (!ok) throw Error("Invalid audio clip.");
  return { offset: 0, mode: "ref", lane: "", ...clip };
}

// shots: the Story editor's records; audio: lane clips; lanes: lane order, including empty lanes.
export function readProject(text) {
  const story = readStory(text || "");
  if (story.error || !(text || "").trimStart().startsWith("{")) return { shots: story.shots, audio: [], lanes: [], error: story.error };
  try {
    const data = JSON.parse(text);
    const audio = (data.audio || []).map(readClip);
    const lanes = [...new Set([...(data.audio_lanes || []), ...audio.map((clip) => clip.lane)])].filter(Boolean);
    return { shots: story.shots, audio, lanes, error: "" };
  } catch (error) {
    return { shots: [], audio: [], lanes: [], error: `${error.message} Original data retained.` };
  }
}

export function writeProject({ shots, audio, lanes }) {
  if (!shots.length && !audio.length && !lanes.length) return "";
  return JSON.stringify({ format: SHOT_FORMAT, schema_version: 1, shots, audio, audio_lanes: lanes });
}

export function newShot(start, end, media = []) {
  return createShot({ start, end, media: media.map((id) => ({ schema_version: 1, context_id: id, role: "context" })) });
}

export function newClip(contextId, lane, start, end) {
  return { schema_version: 1, id: uid("clip"), context_id: contextId, start, end, offset: 0, mode: "ref", lane };
}

export const newLane = () => uid("lane");

// Free room around `sec` among non-overlapping items: {prev, next}, or null when `sec` is inside one.
export function gapAt(items, sec, total) {
  let prev = 0, next = total;
  for (const item of sorted(items)) {
    if (item.end <= sec) prev = item.end;
    else if (item.start > sec) { next = item.start; break; }
    else return null;
  }
  return { prev, next };
}

// Where a new item dropped at `sec` goes: up to `length` seconds of the free room there.
export function placeAt(items, sec, total, length) {
  const gap = gapAt(items, sec, total);
  if (!gap || gap.next - gap.prev < MIN_LENGTH) return null;
  const start = r1(Math.max(gap.prev, Math.min(sec, gap.next - MIN_LENGTH)));
  return { start, end: r1(Math.min(start + length, gap.next)) };
}

function neighbours(items, id, total) {
  const list = sorted(items), index = list.findIndex((item) => item.id === id);
  return { prev: index > 0 ? list[index - 1].end : 0, next: index < list.length - 1 ? list[index + 1].start : total };
}

// drag: {id, mode: move|left|right, start, end, reorder}. Shots may be carried over their neighbours (reorder);
// clips and edge drags stay between their neighbours.
export function dragTo(items, drag, delta, total) {
  const ds = r1(delta), length = drag.end - drag.start;
  let start = drag.start, end = drag.end, target = null;
  if (drag.mode === "move" && drag.reorder) {
    start = r1(Math.max(0, Math.min(drag.start + ds, total - length)));
    end = r1(start + length);
    // Like a sortable list: the leading edge passing another shot's middle puts the carried shot on its far side.
    const others = sorted(items.filter((item) => item.id !== drag.id)), edge = ds > 0 ? end : start;
    if (others.some((item) => start < item.end && end > item.start))
      target = others.filter((item) => (item.start + item.end) / 2 < edge).length;
  } else {
    const room = neighbours(items, drag.id, total);
    if (drag.mode === "move") { start = r1(Math.max(room.prev, Math.min(drag.start + ds, room.next - length))); end = r1(start + length); }
    else if (drag.mode === "left") start = r1(Math.max(room.prev, Math.min(drag.start + ds, drag.end - MIN_LENGTH)));
    else end = r1(Math.max(drag.start + MIN_LENGTH, Math.min(drag.end + ds, room.next)));
  }
  return { items: items.map((item) => (item.id === drag.id ? { ...item, start, end } : item)), target };
}

// Drop a carried shot at `target` among the others; lengths stay and the gaps of the layout before the drag are kept.
export function reorder(items, id, target, layout) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const order = sorted(items.filter((item) => item.id !== id)).map((item) => item.id);
  order.splice(target, 0, id);
  const gaps = layout.map((item, index) => (index ? item.start - layout[index - 1].end : item.start));
  let time = gaps[0];
  const placed = new Map(order.map((key, index) => {
    const length = byId.get(key).end - byId.get(key).start, at = { start: r1(time), end: r1(time + length) };
    time += length + (gaps[index + 1] || 0);
    return [key, at];
  }));
  return items.map((item) => ({ ...item, ...placed.get(item.id) }));
}

// Which part of the source file a lane clip plays in each render part; plan chunks give their story range in seconds.
export function clipParts(clip, chunks) {
  return chunks.filter((chunk) => clip.start < chunk.end_s && clip.end > chunk.start_s).map((chunk) => {
    const a = Math.max(clip.start, chunk.start_s), b = Math.min(clip.end, chunk.end_s);
    return { index: chunk.index, story: [a, b], file: [clip.offset + a - clip.start, clip.offset + b - clip.start] };
  });
}

export function clipToFit(items, total) {
  return items.filter((item) => item.start < total - MIN_LENGTH / 2).map((item) => ({ ...item, end: Math.min(item.end, total) }));
}

// Native reference slots one render part uses. A shared image is presented once per Subject and takes a slot each time;
// a first/last frame that is already a Picture reuses that slot; guides and locked sound are not reference tokens.
export function chunkBudget(chunk) {
  const ids = { image: new Set(), video: new Set(), audio: new Set() };
  const pictures = new Set(chunk.refs.filter((ref) => ref.kind === "picture").map((ref) => ref.ctx_id));
  chunk.refs.forEach((ref, index) => {
    if (["first_frame", "last_frame"].includes(ref.kind) && pictures.has(ref.ctx_id)) return;
    const media = { picture: "image", first_frame: "image", last_frame: "image", video: "video", audio: "audio" }[ref.kind];
    if (media) ids[media].add(ref.kind === "picture" ? `${index}:${ref.ctx_id}` : `${ref.kind}:${ref.ctx_id}`);
  });
  return { image: ids.image.size, video: ids.video.size, audio: ids.audio.size, total: ids.image.size + ids.video.size + ids.audio.size };
}

// The same choice the Python side makes for a new node: an H3 turbo LoRA for this model, files converted for ComfyUI first.
export function preferredTurboLora(options, kind) {
  const turbo = (options || []).filter((name) => /turbo/i.test(name) && /h3|minimax/i.test(name));
  const named = turbo.filter((name) => name.toLowerCase().includes(kind));
  const generic = turbo.filter((name) => !/fl2v|ref2v/i.test(name));
  return [...(named.length ? named : generic)].sort((a, b) => /comfy/i.test(b) - /comfy/i.test(a))[0] || "none";
}
