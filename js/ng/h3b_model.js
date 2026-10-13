// The H3 Storyboard's data: a board of numbered panels, each a stack of layers, and the geometry of the sheet the
// browser draws (title line on top, panels in a grid, each with its picture and a caption under it). No DOM here, so
// the rules can be tested with node. ng/core/storyboard.py reads the same board.
export const FORMAT = "h3-storyboard";
export const MAX_PANELS = 9;
export const ASPECTS = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "21:9": [21, 9] };
export const SHEET_WIDTH = 1672;   // the width of the user's ChatGPT boards (1672 x 941 for four 16:9 panels)
export const PICTURE_LONG = 1280;  // a panel's own picture, long side

const MARGIN = 10, GAP = 12, TITLE = 64, CAPTION = 74;

export function newId(prefix) {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

export function newPanel(seconds = 2.5) {
  return { id: newId("p"), seconds, title: "", caption: "", shot: "", first_frame: false, layers: [] };
}

export function newBoard() {
  return { format: FORMAT, schema_version: 1, id: newId("sb"), title: "", subtitle: "", aspect: "16:9", idea: "",
    panels: [1, 2, 3, 4].map(() => newPanel(2.5)) };
}

// A layer's place is relative to its panel's picture: x/y the centre (0..1 of width/height), scale the width of a picture
// layer as a part of the panel's width, size the height of a text line as a part of the panel's height.
export function newLayer(kind, extra = {}) {
  const base = { id: newId("l"), kind, name: "", x: 0.5, y: 0.5, rotation: 0, flip: false, opacity: 1, hidden: false };
  // redrawn: the panel redrawn by the image model (stage 3); it is left out of the collage the next redraw starts from.
  if (kind === "image") return { ...base, src: null, scale: 0.6, redrawn: false, ...extra };
  if (kind === "text") return { ...base, text: "Text", size: 0.08, color: "#FFFFFF", ...extra };
  return { ...base, kind: "fill", color: "#1B2233", ...extra };
}

const num = (value, fallback, lo, hi) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

function readLayer(raw) {
  if (!raw || typeof raw !== "object" || !["image", "text", "fill"].includes(raw.kind)) return null;
  const layer = newLayer(raw.kind, { id: String(raw.id || newId("l")), name: String(raw.name || "") });
  Object.assign(layer, { x: num(raw.x, 0.5, -1, 2), y: num(raw.y, 0.5, -1, 2), rotation: num(raw.rotation, 0, -360, 360),
    flip: Boolean(raw.flip), opacity: num(raw.opacity, 1, 0, 1), hidden: Boolean(raw.hidden) });
  if (raw.kind === "image") {
    const src = raw.src && typeof raw.src === "object" && raw.src.filename ? { filename: String(raw.src.filename),
      subfolder: String(raw.src.subfolder || ""), type: raw.src.type === "output" ? "output" : "input" } : null;
    Object.assign(layer, { src, scale: num(raw.scale, 0.6, 0.02, 5), redrawn: Boolean(raw.redrawn) });
  } else if (raw.kind === "text") Object.assign(layer, { text: String(raw.text ?? ""), size: num(raw.size, 0.08, 0.01, 0.5),
    color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : "#FFFFFF" });
  else layer.color = /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : "#1B2233";
  return layer;
}

// { board, error }: a saved board, repaired where it can be; an empty text is a new board.
export function readBoard(text) {
  if (!String(text || "").trim()) return { board: newBoard(), error: "" };
  let raw;
  try { raw = JSON.parse(text); } catch (error) { return { board: newBoard(), error: `The saved storyboard is not readable (${error.message}); a new one is shown.` }; }
  if (!raw || raw.format !== FORMAT) return { board: newBoard(), error: "The saved data is no H3 storyboard; a new one is shown." };
  const panels = (Array.isArray(raw.panels) ? raw.panels : []).slice(0, MAX_PANELS).map((p) => ({
    id: String(p?.id || newId("p")), seconds: num(p?.seconds, 2.5, 0.1, 600), title: String(p?.title || ""),
    caption: String(p?.caption || ""), shot: String(p?.shot || ""), first_frame: Boolean(p?.first_frame),
    layers: (Array.isArray(p?.layers) ? p.layers : []).map(readLayer).filter(Boolean) }));
  return { board: { format: FORMAT, schema_version: 1, id: String(raw.id || newId("sb")), title: String(raw.title || ""),
    subtitle: String(raw.subtitle || ""), aspect: ASPECTS[raw.aspect] ? raw.aspect : "16:9", idea: String(raw.idea || ""),
    panels: panels.length ? panels : [newPanel()] }, error: "" };
}

export function writeBoard(board) {
  return JSON.stringify(board);
}

// [start, end] in seconds of each panel, end to end from 0.
export function panelTimes(board) {
  let start = 0;
  return board.panels.map((panel) => { const end = Math.round((start + Number(panel.seconds)) * 1000) / 1000; const span = [start, end]; start = end; return span; });
}

export function fmtSeconds(value) {
  return String(Math.round(value * 10) / 10);
}

export function setPanelCount(board, count) {
  const n = Math.max(1, Math.min(MAX_PANELS, Math.round(count)));
  const last = board.panels[board.panels.length - 1]?.seconds || 2.5;
  const panels = board.panels.slice(0, n);
  while (panels.length < n) panels.push(newPanel(last));
  return { ...board, panels };
}

// Columns and rows of the sheet: landscape panels two side by side up to four, three up to nine; portrait panels in up
// to two rows.
export function grid(count, aspect) {
  const [w, h] = ASPECTS[aspect] || ASPECTS["16:9"];
  let cols;
  if (h > w) cols = count <= 4 ? count : Math.ceil(count / 2);
  else if (w === h) cols = count <= 3 ? count : count <= 4 ? 2 : 3;
  else cols = count <= 2 ? count : count <= 4 ? 2 : 3;
  return { cols, rows: Math.ceil(count / cols) };
}

// Where everything sits on the sheet, in sheet pixels.
export function sheetLayout(board, width = SHEET_WIDTH) {
  const [aw, ah] = ASPECTS[board.aspect] || ASPECTS["16:9"];
  const { cols, rows } = grid(board.panels.length, board.aspect);
  const title = board.title || board.subtitle ? TITLE : 0;
  const pw = (width - 2 * MARGIN - (cols - 1) * GAP) / cols, ph = pw * ah / aw;
  const panels = board.panels.map((_, index) => {
    const col = index % cols, row = Math.floor(index / cols);
    const x = MARGIN + col * (pw + GAP), y = MARGIN + title + row * (ph + CAPTION + GAP);
    return { x, y, w: pw, h: ph + CAPTION, pic: { x, y, w: pw, h: ph }, cap: { x, y: y + ph, w: pw, h: CAPTION } };
  });
  return { width, height: Math.round(2 * MARGIN + title + rows * (ph + CAPTION) + (rows - 1) * GAP), title, panels };
}

// The size of one panel's own picture (the panels output), long side PICTURE_LONG.
export function pictureSize(aspect) {
  const [w, h] = ASPECTS[aspect] || ASPECTS["16:9"];
  return w >= h ? [PICTURE_LONG, Math.round(PICTURE_LONG * h / w)] : [Math.round(PICTURE_LONG * w / h), PICTURE_LONG];
}

// A layer's box in a picture of width pw and height ph: centre, width and height before rotation. natural: the
// [width, height] of a picture layer's file.
export function layerBox(layer, pw, ph, natural = [1, 1]) {
  const cx = layer.x * pw, cy = layer.y * ph;
  if (layer.kind === "fill") return { cx: pw / 2, cy: ph / 2, w: pw, h: ph };
  if (layer.kind === "text") {
    const size = layer.size * ph, lines = String(layer.text || " ").split("\n");
    const longest = Math.max(...lines.map((line) => line.length), 1);
    return { cx, cy, w: Math.max(size, longest * size * 0.55), h: size * 1.2 * lines.length };
  }
  const w = layer.scale * pw;
  return { cx, cy, w, h: w * (natural[1] || 1) / (natural[0] || 1) };
}

// Whether the point (px, py) of the picture lies on the layer, rotation included.
export function hits(layer, px, py, pw, ph, natural) {
  const box = layerBox(layer, pw, ph, natural);
  const a = -layer.rotation * Math.PI / 180, dx = px - box.cx, dy = py - box.cy;
  const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(rx) <= box.w / 2 && Math.abs(ry) <= box.h / 2;
}

// The view URL of a picture layer's file.
export function srcUrl(src) {
  if (!src) return "";
  const q = new URLSearchParams({ filename: src.filename, subfolder: src.subfolder || "", type: src.type || "input" });
  return `/view?${q}`;
}

// The name LoadImage reads a layer's file by ("h3-storyboard/a.png", or "... [output]" for a cut-out).
export function loadName(src) {
  const name = src.subfolder ? `${src.subfolder}/${src.filename}` : src.filename;
  return src.type === "output" ? `${name} [output]` : name;
}

// The shot texts of the panels as the Director's shot document (the node's "shots" output computes the same).
export function shotsDocument(board) {
  const times = panelTimes(board);
  return { format: "h3-director-shots", schema_version: 1, shots: board.panels.map((panel, index) => ({
    id: `sb-${panel.id}`, start: times[index][0], end: times[index][1],
    text: (panel.shot || panel.caption || panel.title || "").trim(), media: [], spoken: [], locked_fields: [], draft: null })) };
}

const BEAT_MARK = /\d+(?:[.,]\d+)?\s*s?\s*[–-]\s*\d+(?:[.,]\d+)?\s*s\s*:\s*/g;

// The image model's instruction for redrawing one panel: image 1 is the collage (it sets composition and size), images 2..
// are the character references, in the order of refs ([{name, description}]).
export function redrawPrompt(board, index, refs = []) {
  const panel = board.panels[index];
  const story = (panel.caption || panel.shot || panel.title || "").replace(BEAT_MARK, "").replace(/@(\S)/g, "$1").trim();
  const parts = [
    `Redraw image 1 as one finished, polished storyboard frame${refs.length ? " in the art style of the character references" : ""}.`,
    "Keep its composition exactly: the same figures at the same places, with the same sizes, poses and directions, the same "
      + "background layout and the same framing.",
    "Remove every cut-out edge, collage seam and pasted look: one consistent scene with consistent light and shadows.",
    ...refs.map((ref, i) => `${ref.name} looks exactly as in image ${i + 2}: face, hair, outfit and colours${ref.description ? ` (${ref.description.replace(/\.$/, "")})` : ""}.`),
    story ? `What happens: ${story}` : "",
    "No text, no captions, no labels, no panel border.",
  ];
  return parts.filter(Boolean).join(" ");
}

// The Director's shots of the board: one shot per panel, the storyboard card on every shot and a panel's own card as the
// first frame of its shot. ids: { storyboard: context id or "", frames: { panel index: context id } }.
export function directorShots(board, ids = {}) {
  return shotsDocument(board).shots.map((shot, index) => ({ ...shot, media: [
    ...(ids.storyboard ? [{ schema_version: 1, context_id: ids.storyboard, role: "storyboard" }] : []),
    ...(ids.frames?.[index] ? [{ schema_version: 1, context_id: ids.frames[index], role: "first_frame" }] : []) ] }));
}
