// The Context cards' rules without a DOM: what each medium offers, what a role means in the Director's mode,
// and where the Studio uses a card. Checked with node in tests/ng/js/test_h3c_model.mjs.
import { readProject, sorted } from "./h3s_model.js";

// Keys are the values ng/core/context.py accepts (CONTENT_BY_MEDIA / USAGE_BY_MEDIA); labels are what the card shows.
export const CONTENT = {
  image: [["character", "Character"], ["face", "Face / identity"], ["outfit", "Outfit"], ["pose", "Pose"], ["environment", "Environment"], ["style", "Style"]],
  video: [["motion", "Character motion"], ["camera_motion", "Camera motion"], ["environment", "Environment"], ["shot_rhythm", "Shot rhythm"], ["identity", "Character identity"], ["control", "Control video"]],
  audio: [["voice", "Voice"], ["dialogue", "Dialogue"], ["singing", "Singing"], ["music", "Music"], ["ambience", "Ambience"], ["sound_effect", "Sound effect"]],
};
export const USAGE = {
  image: [["reference", "Reference", "who / what"], ["first_frame", "First frame", ""], ["last_frame", "Last frame", ""],
    ["keyframe", "Keyframe", "time in Studio"], ["storyboard", "Storyboard", "References: plans shots"]],
  video: [["motion", "Motion reference", ""], ["camera", "Camera reference", ""], ["continue", "Continue from video", ""], ["structure", "Whole structure", ""], ["control", "Control video", "Canny / Pose / Depth / Inpaint"]],
  audio: [["voice", "Voice", "timbre of a figure"], ["copy", "Copy", "reuse the sound"], ["lock", "Lock", "keep it exactly"],
    ["music_style", "Music style", ""], ["rhythm", "Rhythm", ""], ["sound_reference", "Sound reference", ""]],
  text: [["style", "Style / direction", ""], ["rule", "Rule", ""], ["character", "Character", ""], ["world", "World lore", ""], ["scene", "Scene / story", "read by the AI"],
    ["camera", "Camera rule", ""], ["dialogue", "Dialogue rule", ""], ["constraint", "Constraint", ""], ["instruction", "General", ""]],
};
// Preserve keys and their three levels, as context_options.preserve stores them; background has its own words.
export const KEEP = [["identity", "Identity"], ["outfit", "Outfit"], ["pose", "Pose"], ["background", "Background"]];
export const KEEP_LEVELS = { identity: ["low", "medium", "high"], outfit: ["low", "medium", "high"], pose: ["low", "medium", "high"], background: ["ignore", "keep", "high"] };

const FRAME_ROLES = ["first_frame", "last_frame", "keyframe", "storyboard"];

// The analysis route keeps `usage` as free text (only the card knows its medium's roles). A suggested role or content
// kind is kept only when it is one of this medium's keys or labels; anything else is dropped, never written to a widget.
// What the card can show, sent with an analysis so the AI picks a role from exactly these (ng/core/analysis.py).
export const offerFor = (media) => ({ content: (CONTENT[media] || []).map(([key]) => key), usage: USAGE[media].map(([key]) => key) });

export function usableFields(media, fields) {
  const pick = (list, value) => {
    const wanted = String(value || "").trim().toLowerCase();
    return (list || []).find(([key, label]) => key === wanted || label.toLowerCase() === wanted || key === wanted.replace(/[\s/-]+/g, "_"))?.[0];
  };
  const out = {};
  // A Text card shows no description: its note is the text. What it cannot show is not offered for Accept.
  if (fields.description && media !== "text") out.description = fields.description;
  const content = pick(CONTENT[media], fields.content), usage = pick(USAGE[media], fields.usage);
  if (content) out.content = content;
  if (usage) out.usage = usage;
  return out;
}

// One sentence under "Use as": what the role does in the Director's current mode, and a warning when it does nothing there.
export function roleHint(media, role, mode) {
  const fl = mode === "fl2va";
  if (media === "image") {
    // Since 2026-10-12 a reference picture reaches H3 in FL2VA too, next to the frames (ng/core/fl2va_refs.py); it is no frame.
    if (fl && !FRAME_ROLES.includes(role)) return { text: "H3 keeps this figure or thing recognizable as a reference next to the frames. It is no frame of the video; for a start picture choose First frame.", warn: false };
    if (role === "reference") return { text: "H3 keeps this figure or thing recognizable wherever a shot uses it.", warn: false };
    if (role === "keyframe") return { text: fl ? "Drop it on a shot in the Studio and set its time there: a render part ends on it and the shot runs on."
      : "Drop it on a shot in the Studio and set its time there (seconds after the shot's start).", warn: false };
    // MiniMax's guide: a storyboard is a planning reference (viewpoint, placement, shot order), References mode only.
    if (role === "storyboard") return fl ? { text: "First / last frame mode has no storyboard; switch the Director to References to use it.", warn: true }
      : { text: "Drop it on the shots it plans in the Studio: H3 takes their viewpoint, subject placement and shot order from it. It is no frame of the video.", warn: false };
    return { text: role === "first_frame" ? "Opens the video, or the shot it is dropped on in the Studio." : "Ends the video, or the shot it is dropped on in the Studio.", warn: false };
  }
  if (media === "video") {
    if (role === "control") return { text: "Place it on the Studio's Control lane. Works in both modes; uses ControlNet, not a video reference slot.", warn: false };
    if (fl && role !== "continue") return { text: "First / last frame mode does not use video references; only Continue works there.", warn: true };
    return { text: role === "continue" ? "Continues from the end of the chosen part using its recent movement. Send along also carries its sound; use an audio lock to keep an existing song." : "Sent as a reference wherever a shot uses it.", warn: false };
  }
  if (media === "audio") {
    if (fl && role !== "lock") return { text: "First / last frame mode only uses sound as a lock.", warn: true };
    if (role === "voice") return { text: "The voice of the figure chosen under “Whose voice”.", warn: false };
    return { text: "On an audio lane the Studio chooses lock, copy or reference per clip.", warn: false };
  }
  if (media === "text") {
    if (role === "scene") return { text: "The story, like the Director's Prompt: AI: split into shots reads it. With shots, H3 gets the shots instead.", warn: false };
    return { text: "Sent in every render part, after the Look.", warn: false };
  }
  return { text: "", warn: false };
}

const mentions = (text, name) => Boolean(name) && new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "u").test(text || "");
const fmt = (s) => `${Math.round(s * 10) / 10}`;

// Where the Studio of each connected Director uses this card. A card bound nowhere is part of every render part.
export function studioUses(id, name, directors, usage = "") {
  if (!directors.length) return ["Not connected to a Director"];
  const out = [];
  for (const director of directors) {
    const project = readProject(director.shots || ""), order = sorted(project.shots);
    let bound = false;
    order.forEach((shot, index) => {
      const label = `Shot ${index + 1}`;
      if (shot.media.some((binding) => binding.context_id === id)) { out.push(label); bound = true; }
      if (shot.spoken.some((line) => line.speaker_id === id)) { out.push(`${label} (speaks)`); bound = true; }
    });
    for (const clip of project.audio.filter((entry) => entry.context_id === id)) {
      out.push(`Audio lane ${project.lanes.indexOf(clip.lane) + 1} · ${fmt(clip.start)}–${fmt(clip.end)} s · ${{ lock: "locked", copy: "copy", ref: "reference" }[clip.mode]}`);
      bound = true;
    }
    for (const clip of project.control.filter((entry) => entry.context_id === id)) {
      out.push(`Control lane · ${fmt(clip.start)}–${fmt(clip.end)} s`); bound = true;
    }
    if (mentions(director.idea, name) || order.some((shot) => mentions(shot.text, name))) out.push(`@${name} in the text`);
    if (!bound) out.push(usage === "control" ? "Not on the Control lane" : "Whole project (no shot binding)");
  }
  return [...new Set(out)];
}

// Templates for the Text card: plain editable text with the same bracket kinds Quick insert writes.
export const TEMPLATES = {
  "Cinematic rules": "Keep the camera movement slow and physical. No rapid cuts.\nmood: [lighting]\ncamera: [camera_motion]",
  "Character description": "[character]: age, look, hair, build.\nwears [outfit].\nmoves and speaks like: ...",
  "World lore": "[environment]: where and when this takes place, what is normal there.",
  "Camera rules": "camera: [camera_motion]. Lens and framing: ... Avoid: ...",
  "Dialogue rules": "[dialogue]: who speaks how, language, pace. Lines are spoken exactly as written.",
};
export const INSERTS = [["character", "Character", "#E07A9B"], ["environment", "Environment", "#6FBF73"], ["outfit", "Outfit / style", "#6AA6F8"],
  ["camera_motion", "Camera rule", "#8FC1FF"], ["lighting", "Lighting / mood", "#E6BE57"], ["action", "Action / motion", "#E58A5C"],
  ["dialogue", "Dialogue", "#9C86F0"], ["ambience", "Ambience", "#4CC9B0"], ["music", "Music", "#B38CF5"], ["rules", "Constraint", "#9AA4B5"]];
