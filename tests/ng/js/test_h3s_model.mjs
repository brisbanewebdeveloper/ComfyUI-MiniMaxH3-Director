// Studio data rules: document round trip, 0.1 s grid, reorder, lanes, render-part file windows and canvas presets.
import assert from "node:assert/strict";
import * as model from "../../../js/ng/h3s_model.js";
import * as canvas from "../../../js/ng/h3s_canvas.js";

const shot = (id, start, end) => ({ id, start, end, text: id, media: [], spoken: [], locked_fields: [], draft: null });

// Document: old timed text, shots plus lanes, empty project.
{
  const old = model.readProject("0-4: A walk.\n4-8: A turn.");
  assert.equal(old.shots.length, 2);
  assert.deepEqual([old.audio, old.lanes], [[], []]);
  const clip = model.newClip("song", "lane_a", 0, 20);
  const text = model.writeProject({ shots: old.shots, audio: [clip], lanes: ["lane_a", "lane_b"] });
  const back = model.readProject(text);
  assert.deepEqual(back.audio, [clip]);
  assert.deepEqual(back.lanes, ["lane_a", "lane_b"], "empty lanes are kept");
  assert.equal(back.shots[1].text, "A turn.");
  assert.equal(model.writeProject({ shots: [], audio: [], lanes: [] }), "", "an empty project leaves the Prompt in charge");
  assert.ok(model.readProject('{"format":"h3-director-shots","schema_version":1,"shots":[],"audio":[{"id":"x"}]}').error);
}

// Grid and formatting.
{
  assert.equal(model.r1(3.14159), 3.1);
  assert.equal(model.fmt(10), "10 s");
  assert.equal(model.fmt(10.125), "10.1 s");
  assert.equal(model.span(0, 6.5), "0–6.5 s");
}

// Moving and edges stay between neighbours on the 0.1 s grid.
{
  const shots = [shot("a", 0, 6), shot("b", 6, 13), shot("c", 13, 20)];
  const edge = model.dragTo(shots, { id: "b", mode: "right", start: 6, end: 13 }, 0.26, 20);
  assert.deepEqual(edge.items.find((s) => s.id === "b"), { ...shots[1], end: 13 }, "an edge stops at the next shot");
  const left = model.dragTo(shots, { id: "b", mode: "left", start: 6, end: 13 }, 0.34, 20);
  assert.equal(left.items.find((s) => s.id === "b").start, 6.3);
  const short = model.dragTo(shots, { id: "b", mode: "right", start: 6, end: 13 }, -9, 20);
  assert.equal(short.items.find((s) => s.id === "b").end, 6.5, "a shot keeps its minimum length");
}

// Carrying a shot over others reorders it; lengths and the old gaps stay.
{
  const shots = [shot("a", 0, 6), shot("b", 6, 13), shot("c", 15, 20)];
  const layout = model.sorted(shots).map(({ id, start, end }) => ({ id, start, end }));
  const drag = { id: "a", mode: "move", start: 0, end: 6, reorder: true };
  const moved = model.dragTo(shots, drag, 14, 20);
  assert.equal(moved.target, 2, "dropped behind the last shot");
  const result = model.reorder(moved.items, "a", moved.target, layout);
  assert.deepEqual(model.sorted(result).map((s) => [s.id, s.start, s.end]), [["b", 0, 7], ["c", 7, 12], ["a", 14, 20]], "gaps stay where they were in the row");
  const free = model.dragTo([shot("a", 0, 2), shot("b", 10, 12)], { id: "a", mode: "move", start: 0, end: 2, reorder: true }, 4, 20);
  assert.equal(free.target, null, "free room means no reorder");
  assert.deepEqual([free.items[0].start, free.items[0].end], [4, 6]);
}

// New items fill the free room at the drop point.
{
  const shots = [shot("a", 0, 6), shot("b", 9, 20)];
  assert.deepEqual(model.placeAt(shots, 7, 20, 4), { start: 7, end: 9 });
  assert.equal(model.placeAt(shots, 3, 20, 4), null, "no room inside a shot");
  assert.deepEqual(model.placeAt([], 18, 20, 4), { start: 18, end: 20 });
}

// A lane clip keeps its own clock across render parts.
{
  const clip = { start: 4, end: 18, offset: 10 };
  const chunks = [{ index: 0, start_s: 0, end_s: 10 }, { index: 1, start_s: 10, end_s: 20 }];
  assert.deepEqual(model.clipParts(clip, chunks), [{ index: 0, story: [4, 10], file: [10, 16] }, { index: 1, story: [10, 18], file: [16, 24] }]);
  assert.deepEqual(model.clipToFit([{ start: 2, end: 30 }, { start: 19.9, end: 25 }], 20), [{ start: 2, end: 20 }]);
  assert.equal(model.partColor(7)[0], model.PART_COLORS[1][0]);
}

// Canvas: the Legacy presets and fit.
{
  assert.equal(canvas.presetValue(0, 0), "auto");
  assert.equal(canvas.presetValue(1344, 768), "1344x768");
  assert.equal(canvas.presetValue(1000, 768), "custom");
  assert.deepEqual(canvas.fitAspect(canvas.NATIVE_MP * 1e6, 9 / 16), [768, 1344], "the Legacy 9:16 budget fit");
  assert.deepEqual(canvas.fitAspect(canvas.NATIVE_MP * 1e6, 16 / 9), [1344, 768]);
  assert.equal(canvas.nearestAspect(1344, 768), "16:9");
  assert.equal(canvas.nearestAspect(1000, 333), "");
  assert.equal(canvas.snap32(1000), 992);
  assert.equal(canvas.canvasInfo(1920, 1088)[1], "warn");
  assert.equal(canvas.canvasInfo(0, 0)[1], "");
}

// Reference slots per render part (moved from the former Inspector, same three cases).
{
  const refs = (...list) => ({ refs: list.map(([kind, ctx_id]) => ({ kind, ctx_id })) });
  assert.deepEqual(model.chunkBudget(refs(["picture", "alice"], ["picture", "coat"], ["picture", "bob"], ["picture", "coat"], ["video", "move"],
    ["audio", "voice_a"], ["audio", "voice_b"])), { image: 4, video: 1, audio: 2, total: 7 }, "a shared asset takes one Picture slot per Subject");
  assert.deepEqual(model.chunkBudget(refs(["picture", "alice"], ["picture", "coat"], ["picture", "bob"], ["picture", "coat"], ["picture", "start"],
    ["first_frame", "start"], ["continue_video", "move"], ["keyframe", "key"], ["lock", "sound"], ["audio", "voice_a"], ["audio", "voice_b"])),
    { image: 5, video: 0, audio: 2, total: 7 }, "a frame that is a Picture reuses its slot; guides and locks are not reference tokens");
  assert.deepEqual(model.chunkBudget(refs(["first_frame", "frame"], ["last_frame", "frame"])), { image: 2, video: 0, audio: 0, total: 2 });
}

// Turbo LoRA preference mirrors the Python default.
{
  const names = ["flux2/Flux2TurboComfyv2.safetensors", "minimax-h3/minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors",
    "minimax-h3/minimax_h3_turbo_4step_ckpt500.safetensors", "minimax-h3/minimax_h3_turbo_4step_ckpt500_pruned_comfyui.safetensors"];
  assert.equal(model.preferredTurboLora(names, "fl2v"), names[1]);
  assert.equal(model.preferredTurboLora(names, "ref2v"), names[3]);
  assert.equal(model.preferredTurboLora(names.slice(0, 1), "fl2v"), "none");
}

// "+ Shot" always finds a place: room after the selected shot, else any free room, else it halves a shot.
{
  const at = (id, start, end) => ({ id, start, end });
  let made = model.addShotAt([at("a", 0, 4)], null, 8);
  assert.deepEqual([made.shots.at(-1).start, made.shots.at(-1).end, made.split], [4, 8, undefined], "free room after the last shot");
  made = model.addShotAt([at("a", 2, 8)], null, 8);
  assert.deepEqual([made.shots.at(-1).start, made.shots.at(-1).end], [0, 2], "free room before it when the end is full");
  made = model.addShotAt([at("a", 0, 8)], null, 8);
  assert.equal(made.split, "a", "a full timeline (Whole prompt = one shot) halves the shot");
  assert.deepEqual(made.shots.map((s) => [s.start, s.end]), [[0, 4], [4, 8]]);
  made = model.addShotAt([at("a", 0, 3), at("b", 3, 8)], "a", 8);
  assert.equal(made.split, "a", "the selected shot is the one that is halved");
  assert.deepEqual(made.shots.map((s) => [s.start, s.end]).sort((x, y) => x[0] - y[0]), [[0, 1.5], [1.5, 3], [3, 8]]);
  assert.equal(model.addShotAt([at("a", 0, 0.5), at("b", 0.5, 1)], null, 1), null, "nothing to halve below the minimum length");
  // No result ever overlaps.
  for (const shots of [[at("a", 0, 8)], [at("a", 0, 4), at("b", 4, 8)], [at("a", 1, 2), at("b", 5, 8)]]) {
    const list = model.sorted(model.addShotAt(shots, null, 8).shots);
    list.slice(1).forEach((shot, i) => assert.ok(shot.start >= list[i].end - 1e-9, "shots do not overlap"));
  }
}

console.log("h3s model ok");
