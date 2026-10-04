// The Context cards' rules: valid roles, mode-aware hints and where the Studio uses a card.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as model from "../../../js/ng/h3c_model.js";

// Every content kind and role a card offers is one ng/core/context.py accepts for that medium.
{
  const source = readFileSync(new URL("../../../ng/core/context.py", import.meta.url), "utf8");
  const tuple = (dict, media) => {
    const block = source.slice(source.indexOf(`${dict} = {`)), at = block.indexOf(`"${media}": (`);
    return [...block.slice(at, block.indexOf(")", at)).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).slice(1);
  };
  for (const media of ["image", "video", "audio"]) for (const [key] of model.CONTENT[media])
    assert.ok(tuple("CONTENT_BY_MEDIA", media).includes(key), `${media} content ${key} is accepted by Python`);
  for (const media of ["image", "video", "audio", "text"]) for (const [key] of model.USAGE[media])
    assert.ok(tuple("USAGE_BY_MEDIA", media).includes(key), `${media} usage ${key} is accepted by Python`);
  for (const media of ["image", "video", "audio", "text"]) assert.deepEqual(model.USAGE[media].map(([key]) => key).sort(), tuple("USAGE_BY_MEDIA", media).sort(),
    `every ${media} role Python accepts can be shown, so a stored role is never left unmarked`);
  for (const [key] of model.INSERTS) assert.ok(tuple("CONTENT_BY_MEDIA", "text").includes(key), `quick insert ${key} is a text content kind`);
}

// Hints warn exactly where the Director's mode ignores the role.
{
  assert.equal(model.roleHint("image", "reference", "fl2va").warn, true);
  assert.equal(model.roleHint("image", "keyframe", "fl2va").warn, false);
  assert.match(model.roleHint("image", "keyframe", "ref2va").text, /start of that shot/);
  assert.equal(model.roleHint("image", "reference", "ref2va").warn, false);
  assert.equal(model.roleHint("video", "camera", "fl2va").warn, true);
  assert.equal(model.roleHint("video", "continue", "fl2va").warn, false);
  assert.equal(model.roleHint("audio", "voice", "fl2va").warn, true);
  assert.equal(model.roleHint("audio", "lock", "fl2va").warn, false);
  assert.equal(model.roleHint("audio", "copy", "auto").warn, false);
}

// "In the Studio" names shots, spoken lines, lane clips and mentions; an unbound card is part of every render part.
{
  const shot = (id, start, end, extra = {}) => ({ id, start, end, text: "", media: [], spoken: [], locked_fields: [], draft: null, ...extra });
  const doc = JSON.stringify({ format: "h3-director-shots", schema_version: 1,
    shots: [shot("b", 4, 8, { text: "@Mage waves." }), shot("a", 0, 4, { media: [{ schema_version: 1, context_id: "m", role: "context" }],
      spoken: [{ schema_version: 1, text: "Hi.", speaker_id: "m" }] })],
    audio: [{ schema_version: 1, id: "c", context_id: "song", start: 0, end: 8, offset: 0, mode: "lock", lane: "l1" }], audio_lanes: ["l1"] });
  assert.deepEqual(model.studioUses("m", "Mage", [{ shots: doc, idea: "" }]), ["Shot 1", "Shot 1 (speaks)", "@Mage in the text"]);
  assert.deepEqual(model.studioUses("song", "Song", [{ shots: doc, idea: "" }]), ["Audio lane 1 · 0–8 s · locked"]);
  assert.deepEqual(model.studioUses("x", "Camera", [{ shots: "", idea: "slow" }]), ["Whole project (no shot binding)"]);
  assert.deepEqual(model.studioUses("x", "Camera", []), ["Not connected to a Director"]);
  assert.deepEqual(model.studioUses("m", "Ma", [{ shots: doc, idea: "" }]).includes("@Ma in the text"), false, "@Mage is not a mention of Ma");
}

// AI Loader: an address that is no HTTP(S) URL is dropped when the source card changes (user workflow had "custom").
{
  const { clearedAddress } = await import("../../../js/ng/ng_widgets.js");
  assert.deepEqual(clearedAddress("custom"), { base_url: "" });
  assert.deepEqual(clearedAddress("http://127.0.0.1:11434"), {});
  assert.deepEqual(clearedAddress("https://openrouter.ai/api/v1"), {});
  assert.deepEqual(clearedAddress(""), {});
}

// An AI suggestion may only write roles the card's medium has; free text ("Establishing shot ...") never reaches a widget.
{
  assert.deepEqual(model.usableFields("image", { description: "A man.", content: "face", usage: "Establishing shot for character introduction." }),
    { description: "A man.", content: "face" });
  assert.deepEqual(model.usableFields("image", { usage: "Last frame" }), { usage: "last_frame" });
  assert.deepEqual(model.usableFields("audio", { usage: "lock", content: "voice" }), { usage: "lock", content: "voice" });
  assert.deepEqual(model.usableFields("image", { content: "voice" }), {}, "a picture cannot be a voice");
}

console.log("h3c model ok");
