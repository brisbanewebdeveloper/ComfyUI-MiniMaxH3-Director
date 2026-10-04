// The Context cards' rules without a DOM: what each medium offers, what a role means in the Director's mode,
// and where the Studio uses a card. Checked with node in tests/ng/js/test_h3c_model.mjs.
import { readProject, sorted } from "./h3s_model.js";

// Keys are the values ng/core/context.py accepts (CONTENT_BY_MEDIA / USAGE_BY_MEDIA); labels are what the card shows.
export const CONTENT = {
  image: [["character", "Character"], ["face", "Face / identity"], ["outfit", "Outfit"], ["pose", "Pose"], ["environment", "Environment"], ["style", "Style"]],
  video: [["motion", "Character motion"], ["camera_motion", "Camera motion"], ["environment", "Environment"], ["shot_rhythm", "Shot rhythm"], ["identity", "Character identity"]],
  audio: [["voice", "Voice"], ["dialogue", "Dialogue"], ["singing", "Singing"], ["music", "Music"], ["ambience", "Ambience"], ["sound_effect", "Sound effect"]],
};
export const USAGE = {
  image: [["reference", "Reference", "who / what"], ["first_frame", "First frame", ""], ["last_frame", "Last frame", ""],
    ["keyframe", "Keyframe", "time in Studio"], ["storyboard", "Storyboard", "time in Studio"]],
  video: [["motion", "Motion reference", ""], ["camera", "Camera reference", ""], ["continue", "Continue from video", ""], ["structure", "Whole structure", ""]],
  audio: [["voice", "Voice", "timbre of a figure"], ["copy", "Copy", "reuse the sound"], ["lock", "Lock", "keep it exactly"],
    ["music_style", "Music style", ""], ["rhythm", "Rhythm", ""], ["sound_reference", "Sound reference", ""]],
  text: [["style", "Style / direction", ""], ["rule", "Rule", ""], ["character", "Character", ""], ["world", "World lore", ""], ["scene", "Scene", ""],
    ["camera", "Camera rule", ""], ["dialogue", "Dialogue rule", ""], ["constraint", "Constraint", ""], ["instruction", "General", ""]],
};
// Preserve keys and their three levels, as context_options.preserve stores them; background has its own words.
export const KEEP = [["identity", "Identity"], ["outfit", "Outfit"], ["pose", "Pose"], ["background", "Background"]];
export const KEEP_LEVELS = { identity: ["low", "medium", "high"], outfit: ["low", "medium", "high"], pose: ["low", "medium", "high"], background: ["ignore", "keep", "high"] };

const FRAME_ROLES = ["first_frame", "last_frame", "keyframe", "storyboard"];

// One sentence under "Use as": what the role does in the Director's current mode, and a warning when it does nothing there.
export function roleHint(media, role, mode) {
  const fl = mode === "fl2va";
  if (media === "image") {
    if (fl && !FRAME_ROLES.includes(role)) return { text: "First / last frame mode does not use references. Choose a frame role, or switch the Director to References.", warn: true };
    if (role === "reference") return { text: "H3 keeps this figure or thing recognizable wherever a shot uses it.", warn: false };
    if (role === "keyframe" || role === "storyboard") return { text: "Drop it on a shot in the Studio: it guides the start of that shot.", warn: false };
    return { text: role === "first_frame" ? "Opens the video, or the shot it is dropped on in the Studio." : "Ends the video, or the shot it is dropped on in the Studio.", warn: false };
  }
  if (media === "video") {
    if (fl && role !== "continue") return { text: "First / last frame mode does not use video references; only Continue works there.", warn: true };
    return { text: role === "continue" ? "The last frame of the chosen part starts the shot." : "Sent as a reference wherever a shot uses it.", warn: false };
  }
  if (media === "audio") {
    if (fl && role !== "lock") return { text: "First / last frame mode only uses sound as a lock.", warn: true };
    if (role === "voice") return { text: "The voice of the figure chosen under “Whose voice”.", warn: false };
    return { text: "On an audio lane the Studio chooses lock, copy or reference per clip.", warn: false };
  }
  return { text: "", warn: false };
}

const mentions = (text, name) => Boolean(name) && new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "u").test(text || "");
const fmt = (s) => `${Math.round(s * 10) / 10}`;

// Where the Studio of each connected Director uses this card. A card bound nowhere is part of every render part.
export function studioUses(id, name, directors) {
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
    if (mentions(director.idea, name) || order.some((shot) => mentions(shot.text, name))) out.push(`@${name} in the text`);
    if (!bound) out.push("Whole project (no shot binding)");
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
