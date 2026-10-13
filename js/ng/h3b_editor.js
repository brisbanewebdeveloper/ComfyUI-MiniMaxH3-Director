// The H3 Storyboard's editor, the node's face: the sheet on the left (click a panel to edit it, the AI writes the texts
// below it), the selected panel on the right as a canvas with its layers. Pictures come from the Context cards, the input
// folder or an upload; "Cut out" removes a picture's background with ComfyUI's own nodes, queued like any job.
import { h, icon, field, select, keepKeys } from "./h3s_dom.js";
import { ASPECTS, MAX_PANELS, readBoard, writeBoard, newLayer, setPanelCount, panelTimes, fmtSeconds, sheetLayout,
  pictureSize, layerBox, hits, loadName, srcUrl } from "./h3b_model.js";
import { pictureCache, drawPicture, drawSheet } from "./h3b_draw.js";
import { connectedProvider, readContexts, upstreamNode } from "./ng_read.js";
import { aiAction } from "./ng_ai_request.js";
import { noteChange } from "./ng_widgets.js";

const SUBFOLDER = "h3-storyboard";

async function comboOptions(api, nodeClass, input) {
  try {
    const info = (await (await api.fetchApi(`/object_info/${nodeClass}`)).json())[nodeClass];
    const spec = info?.input?.required?.[input];
    if (Array.isArray(spec?.[0])) return spec[0];
    if (spec?.[0] === "COMBO") return spec[1]?.options || [];
  } catch { /* the list stays empty; the user is told where it matters */ }
  return [];
}

function srcOf(name, type = "input") {
  const clean = String(name || "").replace(/ \[(input|output)\]$/, "").replace(/\\/g, "/");
  const cut = clean.lastIndexOf("/");
  return { filename: clean.slice(cut + 1), subfolder: cut < 0 ? "" : clean.slice(0, cut), type };
}

function canvasOf(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.round(w); c.height = Math.round(h);
  return c;
}

export function openBoard(node, app, api, host) {
  const root = h("div", { class: "h3s h3b", tabindex: "-1", role: "region", "aria-label": "H3 Storyboard" });
  keepKeys(root);
  // Wheel and drag on the panel canvas belong to the canvas, not to ComfyUI's graph view.
  root.addEventListener("wheel", (event) => { if (event.target.closest(".h3b-stage")) event.stopPropagation(); }, { passive: true });
  host.append(root);
  const widget = (name) => node.widgets?.find((w) => w.name === name);
  const S = { board: null, error: "", notice: null, selected: 0, layer: null, busy: "", history: [], future: [],
    picker: false, inputNames: null, filter: "", drag: null, lastKey: "", lastFiles: "" };
  const pictures = pictureCache(() => draw());
  const views = { sheet: null, stage: null };

  function load() {
    const { board, error } = readBoard(widget("board")?.value || "");
    S.board = board; S.error = error;
    S.selected = Math.min(S.selected, board.panels.length - 1);
  }
  const panel = () => S.board.panels[S.selected];
  const layer = () => panel()?.layers.find((l) => l.id === S.layer) || null;

  function save() {
    const w = widget("board");
    if (w) { w.value = writeBoard(S.board); node.graph?.change?.(); noteChange(); }
  }
  // A change the user can undo; `quiet` redraws the canvases only (typing, dragging) and keeps the DOM, so focus stays.
  function change(mutate, { quiet = false, undoable = true } = {}) {
    if (undoable) { S.history.push(writeBoard(S.board)); if (S.history.length > 80) S.history.shift(); S.future = []; }
    mutate(S.board);
    save();
    if (quiet) draw(); else render();
  }
  function undo(back = true) {
    const from = back ? S.history : S.future, to = back ? S.future : S.history;
    if (!from.length) return;
    to.push(writeBoard(S.board));
    S.board = readBoard(from.pop()).board;
    S.selected = Math.min(S.selected, S.board.panels.length - 1);
    save(); render();
  }
  function flash(text, error = false) { S.notice = { text, error }; render(); }

  // --- drawing -------------------------------------------------------------------------------------------------------
  function draw() {
    if (views.sheet) {
      const layout = sheetLayout(S.board);
      if (views.sheet.width !== layout.width || views.sheet.height !== layout.height) { views.sheet.width = layout.width; views.sheet.height = layout.height; }
      drawSheet(views.sheet.getContext("2d"), S.board, layout, pictures, { placeholder: true, selected: S.selected });
    }
    if (views.stage && panel()) {
      const [w, h] = pictureSize(S.board.aspect), ctx = views.stage.getContext("2d");
      if (views.stage.width !== w || views.stage.height !== h) { views.stage.width = w; views.stage.height = h; }
      drawPicture(ctx, panel(), { x: 0, y: 0, w, h }, pictures, { placeholder: "Add a picture, a text or a colour below" });
      const chosen = layer();
      if (chosen && !chosen.hidden) {
        const img = chosen.kind === "image" ? pictures.get(chosen.src) : null;
        const box = layerBox(chosen, w, h, img ? [img.naturalWidth, img.naturalHeight] : [16, 9]);
        ctx.save(); ctx.translate(box.cx, box.cy); ctx.rotate(chosen.rotation * Math.PI / 180);
        ctx.strokeStyle = "#8FC1FF"; ctx.lineWidth = 3; ctx.setLineDash([12, 8]); ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
        ctx.restore();
      }
    }
  }

  // --- the files ComfyUI renders from ------------------------------------------------------------------------------------
  async function upload(canvas, name) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const body = new FormData();
    body.append("image", blob, name); body.append("subfolder", SUBFOLDER); body.append("type", "input"); body.append("overwrite", "true");
    const response = await api.fetchApi("/upload/image", { method: "POST", body });
    if (response.status !== 200) throw new Error(`Uploading ${name} failed (${response.status}).`);
    const data = await response.json();
    return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  }
  // The sheet and every panel's picture, uploaded to input/h3-storyboard; the same board is not uploaded twice.
  async function renderFiles() {
    await pictures.ready(S.board);
    const key = writeBoard(S.board);
    if (key === S.lastKey && S.lastFiles) return S.lastFiles;
    const base = `${S.board.id}_${node.id}`, layout = sheetLayout(S.board);
    const sheet = canvasOf(layout.width, layout.height);
    drawSheet(sheet.getContext("2d"), S.board, layout, pictures);
    const files = { sheet: await upload(sheet, `${base}_sheet.png`), panels: [] };
    const [w, h] = pictureSize(S.board.aspect);
    for (const [index, item] of S.board.panels.entries()) {
      const picture = canvasOf(w, h);
      drawPicture(picture.getContext("2d"), item, { x: 0, y: 0, w, h }, pictures);
      files.panels.push(await upload(picture, `${base}_panel${index + 1}.png`));
    }
    S.lastKey = key; S.lastFiles = JSON.stringify(files);
    return S.lastFiles;
  }

  // --- pictures: context cards, input folder, upload, cut-out ------------------------------------------------------------
  function connector() {
    return upstreamNode(node.graph, node.inputs?.find((input) => input.name === "context"));
  }
  function contexts() {
    const source = connector();
    return source ? readContexts(source) : [];
  }
  // A new picture starts as large as fits into the panel (a portrait in a 16:9 panel would run off it at 0.6 of its width).
  async function addPicture(src, name) {
    const img = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = srcUrl(src); });
    const [aw, ah] = ASPECTS[S.board.aspect];
    const scale = img ? Math.min(0.6, 0.9 * (ah / aw) * (img.naturalWidth / img.naturalHeight)) : 0.6;
    change((board) => {
      const item = newLayer("image", { src, name: name || src.filename, scale });
      board.panels[S.selected].layers.push(item); S.layer = item.id;
    });
    S.picker = false; render();
  }
  async function uploadFile(file) {
    const body = new FormData();
    body.append("image", file, file.name); body.append("subfolder", SUBFOLDER); body.append("type", "input");
    const response = await api.fetchApi("/upload/image", { method: "POST", body });
    if (response.status !== 200) { flash(`Upload failed (${response.status}).`, true); return; }
    const data = await response.json();
    addPicture({ filename: data.name, subfolder: data.subfolder || "", type: "input" }, file.name.replace(/\.[^.]+$/, ""));
  }
  async function waitFor(id, seconds = 300) {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
      const entry = (await (await api.fetchApi(`/history/${encodeURIComponent(id)}`)).json())[id];
      if (entry) {
        const failed = (entry.status?.messages || []).find(([type]) => type === "execution_error");
        if (failed) throw new Error(failed[1].exception_message || "The job failed.");
        if (entry.status?.completed || entry.outputs) return entry.outputs || {};
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    throw new Error("The job took too long.");
  }
  // ComfyUI's Remove Background on the picture: a new PNG with the figure on a transparent background, in output/h3-storyboard.
  async function cutOut(item) {
    const models = await comboOptions(api, "LoadBackgroundRemovalModel", "bg_removal_name");
    if (!models.length) { flash("No background removal model found: put one (e.g. birefnet.safetensors) into models/background_removal.", true); return; }
    const model = models.find((name) => /birefnet/i.test(name)) || models[0];
    const prompt = {
      "1": { class_type: "LoadImage", inputs: { image: loadName(item.src) } },
      "2": { class_type: "LoadBackgroundRemovalModel", inputs: { bg_removal_name: model } },
      "3": { class_type: "RemoveBackground", inputs: { bg_removal_model: ["2", 0], image: ["1", 0] } },
      // JoinImageWithAlpha keeps where its mask is 0 (LoadImage's convention), so the foreground mask is inverted first.
      "4": { class_type: "InvertMask", inputs: { mask: ["3", 0] } },
      "5": { class_type: "JoinImageWithAlpha", inputs: { image: ["1", 0], alpha: ["4", 0] } },
      "6": { class_type: "SaveImage", inputs: { images: ["5", 0], filename_prefix: `${SUBFOLDER}/cutout` } },
    };
    S.busy = "cutout"; render();
    try {
      const response = await api.fetchApi("/prompt", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, client_id: api.clientId }) });
      const queued = await response.json();
      if (!queued.prompt_id) throw new Error(queued.error?.message || "ComfyUI did not accept the cut-out job.");
      const outputs = await waitFor(queued.prompt_id);
      const saved = outputs["6"]?.images?.[0];
      if (!saved) throw new Error("The cut-out job saved no picture.");
      change((board) => {
        const target = board.panels.flatMap((p) => p.layers).find((l) => l.id === item.id);
        if (target) { target.src = { filename: saved.filename, subfolder: saved.subfolder || "", type: saved.type || "output" }; target.name = `${item.name || "Picture"} (cut out)`; }
      });
      S.notice = { text: "Cut out. Undo brings the picture with its background back.", error: false };
    } catch (error) {
      S.notice = { text: `Cut out failed: ${error.message}`, error: true };
    } finally { S.busy = ""; render(); }
  }

  // --- AI: the panel texts -----------------------------------------------------------------------------------------------
  async function writeTexts() {
    const provider = connectedProvider(node);
    if (!provider) { flash("Connect the H3 AI Loader to this node's AI provider input.", true); return; }
    if (!S.board.idea.trim()) { flash("Write what should happen first.", true); return; }
    S.busy = "ai"; S.notice = null; render();
    try {
      const data = await aiAction(app, api, "storyboard", { board: writeBoard(S.board), contexts: contexts(), provider });
      const answer = data.suggestion;
      change((board) => {
        board.title = answer.title || board.title; board.subtitle = answer.subtitle || board.subtitle;
        answer.panels.forEach((texts, index) => { if (board.panels[index]) Object.assign(board.panels[index], texts); });
      });
      const notes = [answer.missing?.length && `the AI wrote nothing for panel ${answer.missing.join(", ")}, which kept its texts`,
        answer.unknown_mentions?.length && `${answer.unknown_mentions.map((n) => "@" + n).join(", ")} is no Context card and stays a plain word`];
      const said = notes.filter(Boolean).join("; ");
      S.notice = { text: `The AI wrote the texts${said ? `; ${said}` : ""}. Undo restores the previous ones.`, error: false };
    } catch (error) {
      S.notice = { text: `AI failed: ${error.message}`, error: true };
    } finally { S.busy = ""; render(); }
  }

  // --- the sheet as a Context card for the Director -----------------------------------------------------------------------
  async function useInDirector() {
    S.busy = "card"; render();
    try {
      const files = JSON.parse(await renderFiles());
      const LiteGraph = window.LiteGraph;
      const card = LiteGraph.createNode("NGContextImage");
      card.pos = [node.pos[0] + node.size[0] + 40, node.pos[1]];
      app.graph.add(card);
      const set = (name, value) => { const w = card.widgets?.find((x) => x.name === name); if (w) { w.value = value; w.callback?.(value); } };
      // The card's file list was read when ComfyUI loaded, and on Windows it spells folders with "\": the sheet goes in with
      // the list's spelling, else the frontend flags the card as missing and the server refuses the value as not in the list.
      const listed = card.widgets?.find((x) => x.name === "image")?.options?.values || [];
      const sheet = listed.find((v) => v.replace(/\\/g, "/") === files.sheet)
        || (listed.some((v) => v.includes("\\")) ? files.sheet.replace(/\//g, "\\") : files.sheet);
      if (!listed.includes(sheet)) listed.push(sheet);
      set("image", sheet);
      set("name", "Storyboard");
      set("description", `Storyboard of ${S.board.panels.length} panels with times and captions.`);
      set("content", "composition"); set("usage", "storyboard");
      set("content_roles", JSON.stringify(["composition"])); set("usage_roles", JSON.stringify(["storyboard"]));
      const target = connector(), slot = target?.inputs?.findIndex((input) => input.name.startsWith("context_image.") && input.link == null);
      if (target && slot >= 0) card.connect(0, target, slot);
      app.graph.setDirtyCanvas(true, true);
      S.notice = { text: target && slot >= 0 ? "A Context card with the sheet is connected to the Context Connector; put it on the shots it plans in the Director."
        : "A Context card with the sheet was added next to this node; connect it to the Context Connector.", error: false };
    } catch (error) {
      S.notice = { text: `Could not add the card: ${error.message}`, error: true };
    } finally { S.busy = ""; render(); }
  }

  // --- the panel canvas: select, drag, scale, rotate ----------------------------------------------------------------------
  function stagePoint(event) {
    const rect = views.stage.getBoundingClientRect();
    return [(event.clientX - rect.left) * views.stage.width / rect.width, (event.clientY - rect.top) * views.stage.height / rect.height];
  }
  function stageDown(event) {
    const [px, py] = stagePoint(event), { width: w, height: h } = views.stage;
    const hit = [...panel().layers].reverse().find((item) => !item.hidden && item.kind !== "fill" && hits(item, px, py, w, h,
      item.kind === "image" && pictures.get(item.src) ? [pictures.get(item.src).naturalWidth, pictures.get(item.src).naturalHeight] : [16, 9]));
    if (!hit) { if (S.layer) { S.layer = null; render(); } return; }
    if (S.layer !== hit.id) { S.layer = hit.id; render(); }
    S.history.push(writeBoard(S.board)); S.future = [];
    S.drag = { id: hit.id, px, py, x: hit.x, y: hit.y };
    views.stage.setPointerCapture(event.pointerId);
  }
  function stageMove(event) {
    if (!S.drag) return;
    const [px, py] = stagePoint(event), item = layer();
    if (!item) return;
    item.x = S.drag.x + (px - S.drag.px) / views.stage.width; item.y = S.drag.y + (py - S.drag.py) / views.stage.height;
    draw();
  }
  function stageUp() { if (S.drag) { S.drag = null; save(); render(); } }
  function stageWheel(event) {
    const item = layer();
    if (!item || item.kind === "fill") return;
    event.preventDefault(); event.stopPropagation();
    const step = event.deltaY < 0 ? 1 : -1;
    change(() => {
      if (event.altKey || event.shiftKey) item.rotation = Math.max(-180, Math.min(180, item.rotation + step * 2));
      else if (item.kind === "image") item.scale = Math.max(0.02, Math.min(5, item.scale * (step > 0 ? 1.05 : 1 / 1.05)));
      else item.size = Math.max(0.01, Math.min(0.5, item.size * (step > 0 ? 1.05 : 1 / 1.05)));
    }, { quiet: true, undoable: false });
  }

  // --- the DOM ------------------------------------------------------------------------------------------------------------
  const input = (value, oninput, props = {}) => h("input", { class: "h3s-in", value, oninput: (e) => oninput(e.target.value), ...props });
  const area = (value, oninput, props = {}) => h("textarea", { class: "h3s-in", value, oninput: (e) => oninput(e.target.value), ...props });
  const slider = (label, value, min, max, stepValue, onvalue) => field(label, h("input", { type: "range", min, max, step: stepValue, value,
    onpointerdown: () => { S.history.push(writeBoard(S.board)); S.future = []; },
    oninput: (e) => { onvalue(Number(e.target.value)); save(); draw(); } }));
  const quietText = (mutate) => (value) => { mutate(value); save(); draw(); };
  const remember = () => { S.history.push(writeBoard(S.board)); S.future = []; };

  function header() {
    const times = panelTimes(S.board), total = times[times.length - 1][1];
    return h("div", { class: "h3s-head" },
      h("span", { class: "h3s-title" }, "H3 Storyboard"),
      h("span", { class: "h3s-lbl" }, `${S.board.panels.length} panel${S.board.panels.length === 1 ? "" : "s"} · ${fmtSeconds(total)} s`),
      h("span", { class: "h3s-grow" }),
      field("Panels", select([...Array(MAX_PANELS)].map((_, i) => [String(i + 1), String(i + 1)]), String(S.board.panels.length),
        (value) => change((board) => Object.assign(board, setPanelCount(board, Number(value)))))),
      field("Panel format", select(Object.keys(ASPECTS).map((a) => [a, a]), S.board.aspect, (value) => change((board) => { board.aspect = value; }))),
      h("button", { class: "h3s-btn ghost small", title: "Undo", disabled: !S.history.length, onclick: () => undo(true) }, "Undo"),
      h("button", { class: "h3s-btn ghost small", title: "Redo", disabled: !S.future.length, onclick: () => undo(false) }, "Redo"),
      h("button", { class: "h3s-btn", disabled: Boolean(S.busy), title: "Draws the sheet into input/h3-storyboard and adds a Context card with it (usage Storyboard)",
        onclick: useInDirector }, icon("image"), S.busy === "card" ? "Adding…" : "Use in Director"));
  }

  function sheetCard() {
    views.sheet = h("canvas", { class: "h3b-sheet", onclick: (event) => {
      const rect = views.sheet.getBoundingClientRect(), layout = sheetLayout(S.board);
      const x = (event.clientX - rect.left) * layout.width / rect.width, y = (event.clientY - rect.top) * layout.height / rect.height;
      const index = layout.panels.findIndex((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
      if (index >= 0 && index !== S.selected) { S.selected = index; S.layer = null; render(); }
    } });
    const provider = connectedProvider(node);
    return h("section", { class: "h3s-card" },
      h("div", { class: "h3s-row" },
        field("Title", input(S.board.title, quietText((v) => { S.board.title = v; }), { onfocus: remember, placeholder: "e.g. MINIMAX H3 - STORYBOARD" }), { style: { flex: "1 1 220px" } }),
        field("Subtitle", input(S.board.subtitle, quietText((v) => { S.board.subtitle = v; }), { onfocus: remember, placeholder: "e.g. LUNA & INFERNA - 10 SECONDS" }), { style: { flex: "1 1 220px" } })),
      views.sheet,
      h("span", { class: "h3s-lbl" }, "Click a panel to edit it. The sheet goes to ComfyUI as drawn here."),
      h("div", { class: "h3b-ai" },
        field("What should happen (the AI writes every panel's title, caption and shot from it)",
          area(S.board.idea, quietText((v) => { S.board.idea = v; }), { rows: 3, onfocus: remember, placeholder: "@Luna and @Inferna meet in the candle-lit hall, ..." })),
        h("div", { class: "h3s-row" },
          h("button", { class: "h3s-btn ai", disabled: Boolean(S.busy) || !provider, onclick: writeTexts,
            title: provider ? "Titles, captions and shot texts of all panels; the panel times stay" : "Connect the H3 AI Loader to AI provider" },
          icon("spark"), S.busy === "ai" ? "The AI is writing…" : "AI: write panel texts"),
          provider ? null : h("span", { class: "h3s-lbl" }, "Connect the H3 AI Loader to this node's AI provider input."))));
  }

  function picker() {
    const cards = contexts().filter((entry) => entry.media === "image" && entry.widgets.image);
    // The Context Image card's list: every picture of the input folder, subfolders included (LoadImage lists the top level only).
    if (S.inputNames === null) { S.inputNames = []; comboOptions(api, "NGContextImage", "image").then((names) => { S.inputNames = names; render(); }); }
    const query = S.filter.toLowerCase();
    const names = S.inputNames.filter((name) => !query || name.toLowerCase().includes(query)).slice(0, 60);
    const file = h("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: (e) => e.target.files[0] && uploadFile(e.target.files[0]) });
    return h("div", { class: "h3b-picker" },
      cards.length ? h("div", { class: "h3s-lbl" }, "From the Context cards") : null,
      cards.length ? h("div", { class: "h3b-thumbs" }, cards.map((entry) => {
        const src = srcOf(entry.widgets.image);
        return h("button", { class: "h3b-thumb", title: entry.widgets.name || src.filename, onclick: () => addPicture(src, entry.widgets.name) },
          h("img", { src: `/view?${new URLSearchParams({ filename: src.filename, subfolder: src.subfolder, type: "input" })}`, alt: "" }),
          h("span", {}, entry.widgets.name || src.filename));
      })) : null,
      h("div", { class: "h3s-row" },
        input(S.filter, (v) => { S.filter = v; render(); }, { placeholder: "Search the input folder", style: { flex: "1 1 200px" } }),
        file, h("button", { class: "h3s-btn small", onclick: () => file.click() }, "Upload…"),
        h("button", { class: "h3s-btn ghost small", onclick: () => { S.picker = false; render(); } }, "Close")),
      h("div", { class: "h3b-names" }, names.map((name) => h("button", { class: "h3b-name", onclick: () => addPicture(srcOf(name), name.replace(/\.[^.]+$/, "").split(/[\\/]/).pop()) }, name)),
        S.inputNames.length > names.length ? h("span", { class: "h3s-lbl" }, `${S.inputNames.length - names.length} more: narrow the search`) : null));
  }

  function layerRows() {
    const items = [...panel().layers].reverse();
    if (!items.length) return h("span", { class: "h3s-lbl" }, "No layers yet.");
    return h("div", { class: "h3b-layers" }, items.map((item) => {
      const index = panel().layers.indexOf(item);
      const move = (to) => change((board) => { const list = board.panels[S.selected].layers; const [x] = list.splice(index, 1); list.splice(to, 0, x); });
      return h("div", { class: item.id === S.layer ? "h3b-layer on" : "h3b-layer", onclick: () => { S.layer = item.id; render(); } },
        h("span", { class: "h3b-kind" }, item.kind === "image" ? "Picture" : item.kind === "text" ? "Text" : "Colour"),
        h("span", { class: "h3b-lname" }, item.kind === "text" ? item.text.split("\n")[0] : item.name || item.color || ""),
        h("button", { class: "h3s-btn ghost small", title: item.hidden ? "Show" : "Hide", onclick: (e) => { e.stopPropagation(); change(() => { item.hidden = !item.hidden; }); } }, item.hidden ? "Show" : "Hide"),
        h("button", { class: "h3s-btn ghost small", title: "Up (in front)", disabled: index === panel().layers.length - 1, onclick: (e) => { e.stopPropagation(); move(index + 1); } }, "▲"),
        h("button", { class: "h3s-btn ghost small", title: "Down (behind)", disabled: index === 0, onclick: (e) => { e.stopPropagation(); move(index - 1); } }, "▼"),
        h("button", { class: "h3s-btn ghost small", title: "Remove", "aria-label": "Remove layer", onclick: (e) => { e.stopPropagation(); change((board) => { board.panels[S.selected].layers.splice(index, 1); }); if (S.layer === item.id) S.layer = null; } }, icon("trash", 14)));
    }));
  }

  function layerProps() {
    const item = layer();
    if (!item) return h("span", { class: "h3s-lbl" }, "Click a layer on the panel or in the list. Drag it to move it; the mouse wheel sizes it, with Shift it turns.");
    const common = [slider("Rotation", item.rotation, -180, 180, 1, (v) => { item.rotation = v; }), slider("Opacity", item.opacity, 0, 1, 0.05, (v) => { item.opacity = v; })];
    if (item.kind === "fill") return h("div", { class: "h3b-props" },
      field("Colour", h("input", { type: "color", value: item.color, onfocus: remember, oninput: (e) => quietText((v) => { item.color = v; })(e.target.value) })), common[1]);
    if (item.kind === "text") return h("div", { class: "h3b-props" },
      field("Text", area(item.text, quietText((v) => { item.text = v; }), { rows: 2, onfocus: remember })),
      slider("Size", item.size, 0.02, 0.4, 0.005, (v) => { item.size = v; }),
      field("Colour", h("input", { type: "color", value: item.color, onfocus: remember, oninput: (e) => quietText((v) => { item.color = v; })(e.target.value) })), ...common);
    return h("div", { class: "h3b-props" },
      slider("Size", item.scale, 0.05, 2, 0.01, (v) => { item.scale = v; }), ...common,
      h("div", { class: "h3s-row" },
        h("button", { class: "h3s-btn small", onclick: () => change(() => { item.flip = !item.flip; }) }, "Mirror"),
        h("button", { class: "h3s-btn small ai", disabled: Boolean(S.busy) || !item.src, onclick: () => cutOut(item),
          title: "Removes the background with ComfyUI's Remove Background (queued as a small job)" }, S.busy === "cutout" ? "Cutting out…" : "Cut out"),
        h("button", { class: "h3s-btn ghost small", onclick: () => change(() => { Object.assign(item, { x: 0.5, y: 0.5, rotation: 0 }); }) }, "Centre")));
  }

  function panelCard() {
    const item = panel(), [start, end] = panelTimes(S.board)[S.selected];
    views.stage = h("canvas", { class: "h3b-stage", onpointerdown: stageDown, onpointermove: stageMove, onpointerup: stageUp, onpointercancel: stageUp });
    views.stage.addEventListener("wheel", stageWheel, { passive: false });
    const add = (kind) => change((board) => { const made = newLayer(kind); board.panels[S.selected].layers[kind === "fill" ? "unshift" : "push"](made); S.layer = made.id; });
    return h("section", { class: "h3s-card" },
      h("div", { class: "h3s-row" },
        h("span", { class: "h3s-strong" }, `Panel ${S.selected + 1}`), h("span", { class: "h3s-lbl" }, `${fmtSeconds(start)}–${fmtSeconds(end)} s`),
        h("span", { class: "h3s-grow" }),
        field("Seconds", h("input", { class: "h3s-in", type: "number", min: "0.5", max: "600", step: "0.5", value: item.seconds, style: { width: "90px" },
          onchange: (e) => change((board) => { board.panels[S.selected].seconds = Math.max(0.1, Number(e.target.value) || 2.5); }) })),
        field("Title", input(item.title, quietText((v) => { item.title = v; }), { onfocus: remember, placeholder: "INTRO" }), { style: { flex: "1 1 180px" } })),
      views.stage,
      h("div", { class: "h3s-row" },
        h("button", { class: "h3s-btn small", onclick: () => { S.picker = !S.picker; render(); } }, icon("image", 14), "+ Picture"),
        h("button", { class: "h3s-btn small", onclick: () => add("text") }, icon("text", 14), "+ Text"),
        h("button", { class: "h3s-btn small", onclick: () => add("fill") }, "+ Colour")),
      S.picker ? picker() : null,
      layerRows(), layerProps(),
      field("Caption on the sheet", area(item.caption, quietText((v) => { item.caption = v; }), { rows: 2, onfocus: remember })),
      field("Shot text for H3 (framing, action, camera; time beats for a long panel)", area(item.shot, quietText((v) => { item.shot = v; }), { rows: 4, onfocus: remember })));
  }

  function render() {
    if (!S.board) load();
    const scroll = root.scrollTop;
    root.replaceChildren(h("div", { class: "h3s-page" }, header(),
      S.error ? h("div", { class: "h3s-banner" }, S.error) : null,
      S.notice ? h("div", { class: S.notice.error ? "h3s-banner" : "h3s-hint", style: { margin: "8px 20px 0" } }, S.notice.text,
        h("button", { class: "h3s-btn ghost small", onclick: () => { S.notice = null; render(); } }, "OK")) : null,
      h("div", { class: "h3b-body" }, sheetCard(), panelCard())));
    root.scrollTop = scroll;
    draw();
  }

  load(); render();
  return {
    root, render, renderFiles,
    refresh() { load(); render(); },
    dispose() { root.remove(); },
  };
}
