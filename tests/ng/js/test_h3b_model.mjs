// H3 Storyboard data: a saved board is read back (and repaired), panels follow each other in time, the sheet's grid and
// geometry, and the hit test of a turned layer.
import assert from "node:assert/strict";

const model = await import("../../../js/ng/h3b_model.js");

// A new board: four 16:9 panels of 2.5 s, as the user's ChatGPT boards.
{
  const board = model.newBoard();
  assert.equal(board.panels.length, 4);
  assert.deepEqual(model.panelTimes(board).at(-1), [7.5, 10]);
  const back = model.readBoard(model.writeBoard(board));
  assert.equal(back.error, "");
  assert.deepEqual(back.board, board);
}

// Saved data is repaired where it can be: unknown layers go, numbers are clamped, a bad aspect is 16:9; bad JSON is said.
{
  const text = JSON.stringify({ format: "h3-storyboard", aspect: "5:2", panels: [{ seconds: -3, layers: [
    { kind: "image", src: { filename: "a.png", type: "evil" }, scale: 99 }, { kind: "video" }, { kind: "text", color: "red" }] }] });
  const { board, error } = model.readBoard(text);
  assert.equal(error, "");
  assert.equal(board.aspect, "16:9");
  assert.equal(board.panels[0].seconds, 0.1);
  assert.deepEqual(board.panels[0].layers.map((l) => l.kind), ["image", "text"]);
  assert.equal(board.panels[0].layers[0].src.type, "input");
  assert.equal(board.panels[0].layers[0].scale, 5);
  assert.equal(board.panels[0].layers[1].color, "#FFFFFF");
  assert.match(model.readBoard("{").error, /not readable/);
  assert.match(model.readBoard('{"format":"x"}').error, /no H3 storyboard/);
}

// The panel count keeps the panels there are and adds new ones with the last one's length.
{
  let board = model.newBoard();
  board.panels[3].seconds = 5;
  board = model.setPanelCount(board, 6);
  assert.deepEqual(board.panels.map((p) => p.seconds), [2.5, 2.5, 2.5, 5, 5, 5]);
  assert.equal(model.setPanelCount(board, 20).panels.length, model.MAX_PANELS);
  assert.equal(model.setPanelCount(board, 0).panels.length, 1);
}

// The grid: landscape 2 x 2 for four, 3 x 3 for nine; portrait in up to two rows.
{
  assert.deepEqual(model.grid(4, "16:9"), { cols: 2, rows: 2 });
  assert.deepEqual(model.grid(6, "16:9"), { cols: 3, rows: 2 });
  assert.deepEqual(model.grid(9, "16:9"), { cols: 3, rows: 3 });
  assert.deepEqual(model.grid(4, "9:16"), { cols: 4, rows: 1 });
  assert.deepEqual(model.grid(6, "9:16"), { cols: 3, rows: 2 });
  assert.deepEqual(model.grid(1, "1:1"), { cols: 1, rows: 1 });
}

// The sheet of four 16:9 panels with a title is about the ChatGPT board's 1672 x 941; panels do not overlap.
{
  const board = { ...model.newBoard(), title: "MINIMAX H3 - STORYBOARD" };
  const layout = model.sheetLayout(board);
  assert.equal(layout.width, 1672);
  assert.ok(Math.abs(layout.height - 1050) < 120, `height ${layout.height}`);
  const [a, b, c] = layout.panels;
  assert.ok(b.x >= a.x + a.w && c.y >= a.y + a.h);
  assert.ok(Math.abs(a.pic.w / a.pic.h - 16 / 9) < 1e-9);
  assert.equal(model.sheetLayout(model.newBoard()).title, 0, "no title line without a title");
  assert.deepEqual(model.pictureSize("16:9"), [1280, 720]);
  assert.deepEqual(model.pictureSize("9:16"), [720, 1280]);
}

// A picture layer is as wide as its scale of the panel; the hit test follows its rotation.
{
  const layer = model.newLayer("image", { x: 0.5, y: 0.5, scale: 0.5, rotation: 90 });
  const box = model.layerBox(layer, 1000, 500, [200, 100]);
  assert.deepEqual([box.w, box.h], [500, 250]);
  assert.ok(model.hits(layer, 500, 480, 1000, 500, [200, 100]), "turned 90°: the long side runs down");
  assert.ok(!model.hits(layer, 700, 250, 1000, 500, [200, 100]));
  assert.equal(model.loadName({ filename: "c.png", subfolder: "h3-storyboard", type: "output" }), "h3-storyboard/c.png [output]");
  assert.match(model.srcUrl({ filename: "a b.png", subfolder: "x", type: "input" }), /^\/view\?filename=a\+b\.png&subfolder=x&type=input$/);
}

// The shots document matches the node's: panel times end to end, shot text before caption.
{
  const board = model.newBoard();
  board.panels[0].caption = "Caption."; board.panels[1].shot = "Shot."; board.panels[1].caption = "Ignored.";
  const shots = model.shotsDocument(board).shots;
  assert.deepEqual(shots.map((s) => [s.start, s.end, s.text]).slice(0, 2), [[0, 2.5, "Caption."], [2.5, 5, "Shot."]]);
}

console.log("h3b model ok");
