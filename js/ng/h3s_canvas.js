// Video size choices, taken over from the Legacy Director's settings panel (js/minimax_director.js): the same
// presets, the same ratio list and the same /32 fit for a ratio and a megapixel budget.

export const NATIVE_MP = 1344 * 768 / 1e6;

const NATIVE = [["21:9", 1344, 576], ["2:1", 1344, 672], ["16:9", 1344, 768], ["3:2", 1152, 768], ["4:3", 1024, 768],
  ["5:4", 960, 768], ["1:1", 992, 992], ["4:5", 768, 960], ["3:4", 768, 1024], ["2:3", 768, 1152],
  ["9:16", 768, 1344], ["1:2", 672, 1344], ["9:21", 576, 1344]];
const FAST = [["21:9", 1120, 480], ["2:1", 960, 480], ["16:9", 864, 480], ["3:2", 736, 480], ["4:3", 640, 480],
  ["5:4", 608, 480], ["1:1", 640, 640], ["4:5", 480, 608], ["3:4", 480, 640], ["2:3", 480, 736],
  ["9:16", 480, 864], ["1:2", 480, 960], ["9:21", 480, 1120]];

export const PRESET_GROUPS = [
  ["Nativ · kurze Kante 768", NATIVE],
  ["Schnell · kurze Kante 480", FAST],
  ["Über nativ · langsam, mehr Speicher", [["16:9", 1920, 1088]]],
];
export const ASPECTS = NATIVE.map(([label]) => { const [a, b] = label.split(":").map(Number); return [label, a / b]; });
export const RESIZE = [["crop", "Zuschneiden"], ["stretch to fit", "Strecken"], ["pad", "Rand auffüllen"], ["pad green", "Grün auffüllen"]];

const PRESET_KEYS = new Set(PRESET_GROUPS.flatMap(([, list]) => list.map(([, w, h]) => `${w}x${h}`)));

export const isAuto = (width, height) => !(width > 0 && height > 0);

export function presetValue(width, height) {
  if (isAuto(width, height)) return "auto";
  return PRESET_KEYS.has(`${width}x${height}`) ? `${width}x${height}` : "custom";
}

export const snap32 = (value) => Math.max(32, Math.round(value / 32) * 32);

// Best pair of /32 edges around the ideal one: ratio error first, overshooting the budget costs twice undershooting.
export function fitAspect(pixels, ratio) {
  const edges = (v) => [...new Set([Math.max(32, Math.floor(v / 32) * 32), Math.max(32, Math.ceil(v / 32) * 32)])];
  let best = [768, 768], bestScore = Infinity;
  for (const w of edges(Math.sqrt(pixels * ratio))) for (const h of edges(Math.sqrt(pixels / ratio))) {
    const score = Math.abs(w / h - ratio) / ratio + (w * h > pixels ? 0.5 : 0.25) * Math.abs(w * h - pixels) / pixels;
    if (score < bestScore) { bestScore = score; best = [w, h]; }
  }
  return best;
}

// The ratio a /32 canvas was picked from; within 4 %, which holds every fit in the list.
export function nearestAspect(width, height) {
  if (isAuto(width, height)) return "";
  let best = "", error = 0.04;
  for (const [label, ratio] of ASPECTS) {
    const e = Math.abs(width / height - ratio) / ratio;
    if (e < error) { error = e; best = label; }
  }
  return best;
}

export function canvasInfo(width, height) {
  if (isAuto(width, height)) return ["H3 wählt die Größe aus dem ersten Bild: kurze Kante 768, höchstens so viel Fläche wie 1344×768.", ""];
  if (width * height / 1e6 > NATIVE_MP * 1.05)
    return ["Über H3-nativ (1,03 MP): deutlich langsamer, mehr Speicher und außerhalb dessen, worauf H3 trainiert ist.", "warn"];
  if (Math.min(width, height) <= 512) return ["Schnelle Größe: gut zum Ausprobieren, weniger Details.", ""];
  return ["Im nativen Bereich von H3. Kanten sind Vielfache von 32.", ""];
}
