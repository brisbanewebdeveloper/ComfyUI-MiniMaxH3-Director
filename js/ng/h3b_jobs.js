// The H3 Storyboard's jobs outside the drawing: Cut out (ComfyUI's Remove Background) and Redraw (Qwen Image 2.1), both queued
// like any job, and the Director side: the sheet and first-frame panels as Context cards, the panels as the Director's shots.
// boardJobs takes the editor's state and functions (h3b_editor.js).
import { ASPECTS, newLayer, newId, panelTimes, fmtSeconds, pictureSize, loadName, srcUrl, redrawPrompt, directorShots } from "./h3b_model.js";
import { drawPicture } from "./h3b_draw.js";
import { upstreamNode } from "./ng_read.js";
import { applyValues } from "./ng_widgets.js";

export const SUBFOLDER = "h3-storyboard";

export async function comboOptions(api, nodeClass, input) {
  try {
    const info = (await (await api.fetchApi(`/object_info/${nodeClass}`)).json())[nodeClass];
    const spec = info?.input?.required?.[input];
    if (Array.isArray(spec?.[0])) return spec[0];
    if (spec?.[0] === "COMBO") return spec[1]?.options || [];
  } catch { /* the list stays empty; the user is told where it matters */ }
  return [];
}

export function canvasOf(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.round(w); c.height = Math.round(h);
  return c;
}

export function boardJobs({ S, node, app, api, pictures, change, render, flash, renderFiles, upload, connector, contexts }) {
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

  // --- Context cards for the Director: the sheet (usage Storyboard) and panels used as first frames ----------------------
  const same = (a, b) => String(a || "").replace(/\\/g, "/") === String(b || "").replace(/\\/g, "/");
  function cardOf(file) {
    return app.graph._nodes.find((n) => n.comfyClass === "NGContextImage" && same(n.widgets?.find((w) => w.name === "image")?.value, file)) || null;
  }
  // A card with this file, made and connected to the Context Connector unless one exists; returns [card, connected].
  function ensureCard(file, { name, usage, description }, offset = 0) {
    const found = cardOf(file);
    if (found) return [found, true];
    const card = window.LiteGraph.createNode("NGContextImage");
    card.pos = [node.pos[0] + node.size[0] + 40, node.pos[1] + offset];
    app.graph.add(card);
    const set = (key, value) => { const w = card.widgets?.find((x) => x.name === key); if (w) { w.value = value; w.callback?.(value); } };
    // The card's file list was read when ComfyUI loaded, and on Windows it spells folders with "\": the file goes in with
    // the list's spelling, else the frontend flags the card as missing and the server refuses the value as not in the list.
    const listed = card.widgets?.find((x) => x.name === "image")?.options?.values || [];
    const spelled = listed.find((v) => same(v, file)) || (listed.some((v) => v.includes("\\")) ? file.replace(/\//g, "\\") : file);
    if (!listed.includes(spelled)) listed.push(spelled);
    set("image", spelled); set("name", name); set("description", description);
    set("content", "composition"); set("usage", usage);
    set("content_roles", JSON.stringify(["composition"])); set("usage_roles", JSON.stringify([usage]));
    if (!card.widgets?.find((x) => x.name === "context_id")?.value) set("context_id", newId("ctx_sb_"));
    const target = connector(), slot = target?.inputs?.findIndex((input) => input.name.startsWith("context_image.") && input.link == null);
    if (target && slot >= 0) card.connect(0, target, slot);
    app.graph.setDirtyCanvas(true, true);
    return [card, Boolean(target && slot >= 0)];
  }
  const cardId = (card) => String(card.widgets?.find((w) => w.name === "context_id")?.value || "");

  async function useInDirector() {
    S.busy = "card"; render();
    try {
      const files = JSON.parse(await renderFiles());
      const [, connected] = ensureCard(files.sheet, { name: "Storyboard", usage: "storyboard",
        description: `Storyboard of ${S.board.panels.length} panels with times and captions.` });
      S.notice = { text: connected ? "The sheet's Context card is connected to the Context Connector. Send to Director puts it on the shots."
        : "A Context card with the sheet was added next to this node; connect it to the Context Connector.", error: false };
    } catch (error) {
      S.notice = { text: `Could not add the card: ${error.message}`, error: true };
    } finally { S.busy = ""; render(); }
  }

  // The Director that shares this node's Context Connector (or the only one in the graph).
  function director() {
    const directors = app.graph._nodes.filter((n) => n.comfyClass === "NGH3Director");
    const source = connector();
    return directors.find((d) => source && upstreamNode(d.graph, d.inputs?.find((i) => i.name === "context")) === source)
      || (directors.length === 1 ? directors[0] : null);
  }
  // Stage 4: the panels become the Director's shots, with the sheet's card on every shot and a panel's own picture as the
  // first frame of its shot where the panel says so. The Director's sound lanes, Look and Prompt stay.
  async function sendToDirector() {
    const target = director();
    if (!target) { flash("No H3 Director found: connect both nodes to the same Context Connector.", true); return; }
    const values = Object.fromEntries((target.widgets || []).map((w) => [w.name, w.value]));
    let project = {};
    try { project = String(values.shots || "").trim().startsWith("{") ? JSON.parse(values.shots) : {}; } catch { project = {}; }
    const before = Array.isArray(project.shots) ? project.shots.length : String(values.shots || "").trim() ? 1 : 0;
    if (before && !window.confirm(`Replace the Director's ${before} shot${before === 1 ? "" : "s"} with the ${S.board.panels.length} panels? Its sound lanes stay.`)) return;
    S.busy = "send"; render();
    try {
      const files = JSON.parse(await renderFiles());
      const [sheetCard] = ensureCard(files.sheet, { name: "Storyboard", usage: "storyboard",
        description: `Storyboard of ${S.board.panels.length} panels with times and captions.` });
      const frames = {};
      S.board.panels.forEach((item, index) => {
        if (!item.first_frame) return;
        const [card] = ensureCard(files.panels[index], { name: `Panel ${index + 1}`, usage: "first_frame",
          description: item.caption || `Panel ${index + 1} of the storyboard.` }, 260 * (index + 1));
        frames[index] = cardId(card);
      });
      const shots = directorShots(S.board, { storyboard: cardId(sheetCard), frames });
      const times = panelTimes(S.board);
      const doc = { format: "h3-director-shots", schema_version: 1, ...project, shots };
      const changes = { shots: JSON.stringify(doc), project_seconds: times[times.length - 1][1] };
      if (!String(values.idea || "").trim() && S.board.idea.trim()) changes.idea = S.board.idea;
      applyValues(target, changes);
      target.graph?.change?.();
      S.notice = { text: `The Director has the ${shots.length} panels as shots (${fmtSeconds(changes.project_seconds)} s), the storyboard on every shot`
        + `${Object.keys(frames).length ? ` and ${Object.keys(frames).length} panel picture(s) as first frames` : ""}.`, error: false };
    } catch (error) {
      S.notice = { text: `Could not send the panels: ${error.message}`, error: true };
    } finally { S.busy = ""; render(); }
  }

  // --- Stage 3: redraw a panel with Qwen Image 2.1 -------------------------------------------------------------------------
  // The collage (every visible layer but an earlier redraw) is image 1 and sets composition and size; the Context cards of
  // the characters the panel names are the references. Queued like any job; the result is a new layer over the collage, and
  // every redraw takes a new seed, so asking again gives another version.
  // A card whose file is not in the input folder would stop the whole job, so only cards with a file there count.
  function references(index, present) {
    const item = S.board.panels[index], text = `${item.title} ${item.caption} ${item.shot}`.toLowerCase();
    const cards = contexts().filter((entry) => entry.media === "image" && entry.widgets.image && entry.widgets.name
      && present.some((name) => same(name, String(entry.widgets.image).replace(/ \[input\]$/, "")))
      && !/storyboard|first_frame|last_frame|keyframe/.test(`${entry.widgets.usage} ${entry.widgets.usage_roles || ""}`));
    const named = cards.filter((entry) => text.includes(entry.widgets.name.toLowerCase()));
    return (named.length ? named : cards).slice(0, 4);
  }
  async function redraw(index) {
    const item = S.board.panels[index];
    if (!item.layers.some((l) => !l.hidden && !l.redrawn)) return `panel ${index + 1} has nothing to redraw yet (place pictures on it first)`;
    const [unets, clips, vaes, present] = await Promise.all([comboOptions(api, "UNETLoader", "unet_name"), comboOptions(api, "CLIPLoader", "clip_name"),
      comboOptions(api, "VAELoader", "vae_name"), comboOptions(api, "NGContextImage", "image")]);
    const model = unets.find((n) => /qwen_image_2\.1_int8/i.test(n)) || unets.find((n) => /qwen_image_2\.1/i.test(n));
    const encoder = clips.find((n) => /qwen3vl_8b_int8/i.test(n)) || clips.find((n) => /qwen3vl_8b/i.test(n));
    const vae = vaes.find((n) => /qwen_image_2\.1_vae/i.test(n));
    if (!model || !encoder || !vae) throw new Error("Qwen Image 2.1 needs qwen_image_2.1 (diffusion_models), qwen3vl_8b (text_encoders) and qwen_image_2.1_vae (vae).");
    await pictures.ready(S.board);
    const [w, h] = pictureSize(S.board.aspect), collage = canvasOf(w, h);
    drawPicture(collage.getContext("2d"), { ...item, layers: item.layers.filter((l) => !l.redrawn) }, { x: 0, y: 0, w, h }, pictures);
    const collageName = await upload(collage, `${S.board.id}_${node.id}_collage${index + 1}.png`);
    const refs = references(index, present);
    const prompt = {
      c1: { class_type: "LoadImage", inputs: { image: collageName } },
      u: { class_type: "UNETLoader", inputs: { unet_name: model, weight_dtype: "default" } },
      q: { class_type: "QwenImage21Cache", inputs: { model: ["u", 0], device: "auto", dtype: "default" } },
      t: { class_type: "CLIPLoader", inputs: { clip_name: encoder, type: "qwen_image", device: "default" } },
      v: { class_type: "VAELoader", inputs: { vae_name: vae } },
      e: { class_type: "TextEncodeQwenImage21", inputs: { clip: ["t", 0], vae: ["v", 0], resolution: 1024, negative_prompt: "",
        prompt: redrawPrompt(S.board, index, refs.map((r) => ({ name: r.widgets.name, description: r.widgets.description || "" }))),
        "images.image_1": ["c1", 0] } },
      k: { class_type: "KSampler", inputs: { model: ["q", 0], positive: ["e", 0], negative: ["e", 1], latent_image: ["e", 2],
        seed: Math.floor(Math.random() * 2 ** 32), steps: 25, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 1 } },
      d: { class_type: "VAEDecode", inputs: { samples: ["k", 0], vae: ["v", 0] } },
      s: { class_type: "SaveImage", inputs: { images: ["d", 0], filename_prefix: `${SUBFOLDER}/redraw` } },
    };
    refs.forEach((ref, i) => {
      prompt[`r${i}`] = { class_type: "LoadImage", inputs: { image: String(ref.widgets.image).replace(/ \[input\]$/, "") } };
      prompt.e.inputs[`images.image_${i + 2}`] = [`r${i}`, 0];
    });
    const response = await api.fetchApi("/prompt", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, client_id: api.clientId }) });
    const queued = await response.json();
    if (!queued.prompt_id) throw new Error(queued.error?.message || JSON.stringify(queued.node_errors || {}).slice(0, 300));
    const saved = (await waitFor(queued.prompt_id, 1800)).s?.images?.[0];
    if (!saved) throw new Error("The redraw job saved no picture.");
    const src = { filename: saved.filename, subfolder: saved.subfolder || "", type: saved.type || "output" };
    const img = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = srcUrl(src); });
    const [aw, ah] = ASPECTS[S.board.aspect];
    const scale = img ? Math.max(1, (ah / aw) * (img.naturalWidth / img.naturalHeight)) : 1;
    change((board) => {
      const layers = board.panels[index].layers;
      const old = layers.findIndex((l) => l.redrawn);
      const made = newLayer("image", { src, name: "Redrawn (Qwen Image 2.1)", scale, redrawn: true });
      if (old >= 0) layers.splice(old, 1, made); else layers.push(made);
      if (index === S.selected) S.layer = made.id;
    });
    return true;
  }
  async function redrawPanels(indexes) {
    S.busy = "redraw"; S.notice = null; render();
    let done = 0;
    const skipped = [];
    try {
      for (const [number, index] of indexes.entries()) {
        S.notice = { text: `Redrawing panel ${index + 1} with Qwen Image 2.1 (${number + 1} of ${indexes.length})…`, error: false }; render();
        const result = await redraw(index);
        if (result === true) done += 1; else skipped.push(result);
      }
      S.notice = { text: `Redrawn: ${done} of ${indexes.length} panel${indexes.length === 1 ? "" : "s"}${skipped.length ? `; ${skipped.join("; ")}` : ""}.`
        + (done ? " The collage stays below the new layer; Hide it or Undo to go back." : ""), error: Boolean(skipped.length) };
    } catch (error) {
      S.notice = { text: `Redraw failed: ${error.message}`, error: true };
    } finally { S.busy = ""; render(); }
  }

  return { cutOut, useInDirector, sendToDirector, redrawPanels };
}
