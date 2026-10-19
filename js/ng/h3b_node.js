// The H3 Storyboard node in the graph: its face is the editor (h3b_editor.js). When the workflow is queued, the editor
// draws the sheet and the panels and uploads them; the hidden "rendered" widget then names those files for the node.
import { h } from "./h3s_dom.js";
import { ensureStudioStyle } from "./h3s_style.js";
import { ensureBoardStyle } from "./h3b_style.js";
import { refitAfterResize } from "./ng_layout.js";
import { openBoard } from "./h3b_editor.js";
import { followNodeWidth } from "./ng_widgets.js";
import { hideNative } from "./ng_editor_fields.js";

const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;
const WIDTH = 1300, MIN_WIDTH = 760;

function attach(node) {
  ensureStudioStyle(); ensureBoardStyle();
  node.color = "#2a1f48"; node.bgcolor = "#161127";
  const host = h("div", { class: "h3s-host" });
  hideNative(node, ["board", "rendered"]);
  const dom = followNodeWidth(node.addDOMWidget("h3_storyboard", "h3_storyboard", host, { serialize: false, hideOnZoom: false }));
  let measured = 900, removed = false;
  dom.computeSize = undefined;
  dom.computeLayoutSize = () => ({ minHeight: measured, maxHeight: measured, minWidth: MIN_WIDTH - 20 });
  const editor = openBoard(node, app, api, host);
  // The node is as tall as its editor; a hidden editor measures 0 and is left alone.
  function fit() {
    requestAnimationFrame(() => {
      if (removed || !host.isConnected) return;
      const height = editor.root.scrollHeight;
      if (height < 200) return;
      measured = Math.ceil(height) + 8;
      const size = node.computeSize?.() || [WIDTH, measured], width = Math.max(node.size?.[0] || 0, MIN_WIDTH);
      if (!node.size || Math.abs(node.size[1] - size[1]) > 2 || node.size[0] < MIN_WIDTH) node.setSize([width, size[1]]);
      node.setDirtyCanvas?.(true, true);
    });
  }
  const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit()) : null;
  watcher?.observe(editor.root);
  refitAfterResize(node, fit);
  const rendered = node.widgets?.find((w) => w.name === "rendered");
  if (rendered) {
    // ComfyUI awaits this while it builds the prompt: the files are drawn and uploaded before the job is queued.
    rendered.serializeValue = async () => {
      try { rendered.value = await editor.renderFiles(); }
      catch (error) { console.error("[H3 Storyboard] drawing the sheet failed", error); }
      return rendered.value;
    };
  }
  const configured = node.onConfigure;
  node.onConfigure = function (...args) { const result = configured?.apply(this, args); editor.refresh(); fit(); return result; };
  const connected = node.onConnectionsChange;
  node.onConnectionsChange = function (...args) { const result = connected?.apply(this, args); editor.render(); return result; };
  const gone = node.onRemoved;
  node.onRemoved = function (...args) { removed = true; watcher?.disconnect(); editor.dispose(); return gone?.apply(this, args); };
  node.setSize([WIDTH, measured]);
}

app.registerExtension({
  name: "mmxd.ng.storyboard",
  nodeCreated(node) { if (node.comfyClass === "NGStoryboard") attach(node); },
});
