// Editing uses the existing shot-text contract. Unrecognised text is retained rather than silently rewritten.
const TIME = "(?:\\d+:)?\\d+(?:\\.\\d+)?s?";
const HEADER = new RegExp(`^\\s*(${TIME})\\s*(?:-|–|—|to)\\s*(${TIME})\\s*(?::|\\s)\\s*(.*)$`);

function seconds(token) {
  const parts = token.replace(/s$/, "").split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

export function readStory(text) {
  const shots = [];
  for (const line of text.split("\n")) {
    const match = HEADER.exec(line);
    if (match) shots.push({ start: seconds(match[1]), end: seconds(match[2]), text: match[3] });
    else if (shots.length) shots[shots.length - 1].text += "\n" + line;
    else if (line.trim()) return { shots: [], error: "This shot text has no time range. Edit the original text below; it has been retained." };
  }
  return { shots: shots.map((shot) => ({ ...shot, text: shot.text.trim() })), error: "" };
}

export function writeStory(shots) {
  return shots.map((shot) => `${Number(shot.start).toFixed(2)}-${Number(shot.end).toFixed(2)}: ${shot.text}`).join("\n");
}

export function moveShot(shot, delta, part, duration) {
  if (part === "start") return { ...shot, start: Math.max(0, Math.min(shot.end - 1 / 24, shot.start + delta)) };
  if (part === "end") return { ...shot, end: Math.min(duration, Math.max(shot.start + 1 / 24, shot.end + delta)) };
  const shift = Math.max(-shot.start, Math.min(duration - shot.end, delta));
  return { ...shot, start: shot.start + shift, end: shot.end + shift };
}
