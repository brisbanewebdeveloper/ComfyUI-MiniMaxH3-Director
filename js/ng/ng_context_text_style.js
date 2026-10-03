// The H3 Context Text card's own stylesheet.
//
// It is separate from ng_studio_style.js on purpose. That sheet is shared by the Director, the image,
// video and audio cards and the product nodes (AI Loader, Context Connector). Restyling the Text card
// towards `H3 Context Text.png` must never be able to reach any of them, so every rule here is scoped
// to `.ng-studio-context[data-media=text]` or to a class only ng_context_text.js creates.
//
// It is injected AFTER the shared sheet, so the Text card can also override shared base rules
// (inputs, sections, buttons) without editing the sheet the other nodes depend on.
const CSS = `
.ng-studio-context[data-media=text] .ng-context-top { display:block; }
.ng-studio-context[data-media=text] .ng-text-workspace { display:grid; grid-template-columns:minmax(0,2.5fr) minmax(155px,.85fr) minmax(230px,1.1fr); gap:12px; }
.ng-studio-context[data-media=text] .ng-text-main, .ng-studio-context[data-media=text] .ng-text-sidebar { display:flex; flex-direction:column; gap:12px; min-width:0; }
.ng-studio-context[data-media=text] .ng-text-workspace > .ng-section:nth-child(n+3) { grid-column:auto; }
.ng-studio-context[data-media=text] .ng-text-workspace textarea { min-height:250px; font:14px/1.6 ui-monospace,monospace; }
/* Every panel of the Text card is a filled box on the dark canvas, so the three columns read as three
   separate areas the way the reference does. Scoped here, the other cards keep their shared look. */
.ng-studio-context[data-media=text] .ng-text-workspace .ng-section { background:#0b1626; border:1px solid #1d3557; border-radius:10px; margin:0; padding:10px 12px; }
.ng-studio-context[data-media=text] .ng-text-workspace .ng-section-title { color:#7fb4f0; font-size:12px; letter-spacing:.04em; }
/* The editor is a transparent textarea stacked on a highlighted <pre>, so the syntax colours are the
   real text and the caret stays on top. Both share one grid cell to stay the same size. */
.ng-studio-context[data-media=text] .ng-editor-overlay { display:grid; position:relative; min-width:0; }
.ng-studio-context[data-media=text] .ng-editor-overlay > textarea,
.ng-studio-context[data-media=text] .ng-editor-overlay > pre { grid-area:1/1; width:100%; margin:0;
  padding:26px 12px 12px; font:13px/1.6 ui-monospace,monospace; white-space:pre-wrap; overflow-wrap:break-word; tab-size:4; border:1px solid transparent; }
.ng-studio-context[data-media=text] .ng-editor-overlay > pre { pointer-events:none; color:#e5e9ee; overflow:hidden; min-height:300px; max-height:100%; background:#060d17; border-radius:8px; }
.ng-studio-context[data-media=text] .ng-editor-overlay > textarea { color:transparent; caret-color:#fff; background:transparent; min-height:300px; position:relative; }
.ng-studio-context[data-media=text] .ng-editor-overlay textarea::selection { background:#42688c88; }
/* The count sits inside the frame at the top right, where the reference puts it, not under the box. */
.ng-studio-context[data-media=text] .ng-text-count { position:absolute; top:7px; right:10px; z-index:2; color:#84a3c4; font:11px ui-monospace,monospace; pointer-events:none; }
.ng-studio-context[data-media=text] .ng-text-count[data-over=true] { color:#ff8a7a; font-weight:600; }
/* The grow button has to outrank the textarea, which fills the same cell, or it cannot be clicked. */
.ng-studio-context[data-media=text] .ng-text-grow { position:absolute; right:6px; bottom:6px; z-index:3; width:24px; height:24px; padding:0; font-size:13px; line-height:1; color:#9fb6d4; background:#0d1c30; border:1px solid #24406b; border-radius:6px; }
.ng-studio-context[data-media=text] .ng-text-grow[aria-pressed=true] { color:#4a9eff; border-color:#4a9eff; }
.ng-studio-context[data-media=text] .ng-text-tall > textarea, .ng-studio-context[data-media=text] .ng-text-tall > pre { min-height:520px; }
/* Quick Insert: one coloured row per kind. The tone is also the tone of the matching bracket token. */
.ng-studio-context[data-media=text] .ng-quick-insert { display:flex; align-items:center; gap:9px; width:100%; margin:5px 0; padding:7px 9px; font-size:12px; text-align:left; background:#0d1c30; border:1px solid #24406b; border-radius:8px; }
.ng-studio-context[data-media=text] .ng-quick-icon { flex:none; width:16px; height:16px; color:#7fb4f0; }
.ng-studio-context[data-media=text] .ng-quick-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ng-studio-context[data-media=text] [data-tone=rose] { color:#f472b6; border-color:#5c2748; background:#2a1220; }
.ng-studio-context[data-media=text] [data-tone=green] { color:#4ade80; border-color:#1f5238; background:#0d2418; }
.ng-studio-context[data-media=text] [data-tone=blue] { color:#60a5fa; border-color:#22406e; background:#0e1a30; }
.ng-studio-context[data-media=text] [data-tone=cyan] { color:#22d3ee; border-color:#1c5560; background:#082124; }
.ng-studio-context[data-media=text] [data-tone=orange] { color:#fbbf24; border-color:#5c4415; background:#261c08; }
.ng-studio-context[data-media=text] [data-tone=red] { color:#f87171; border-color:#5e2626; background:#2a1212; }
.ng-studio-context[data-media=text] [data-tone=purple] { color:#c084fc; border-color:#4a2a68; background:#1e1230; }
.ng-studio-context[data-media=text] [data-tone=teal] { color:#2dd4bf; border-color:#1c5450; background:#08211f; }
.ng-studio-context[data-media=text] [data-tone=pink] { color:#f472b6; border-color:#6b2447; background:#2a0d1c; }
.ng-studio-context[data-media=text] [data-tone=indigo] { color:#a5b4fc; border-color:#3b3f7a; background:#14162e; }
.ng-studio-context[data-media=text] [data-tone=amber] { color:#fbbf24; border-color:#6b4a10; background:#2a1f06; }
.ng-studio-context[data-media=text] [data-tone=lime] { color:#a3e635; border-color:#41591a; background:#141f06; }
.ng-studio-context[data-media=text] [data-tone=slate] { color:#94a3b8; border-color:#3c4a5e; background:#131c28; }
.ng-studio-context[data-media=text] .ng-quick-insert[data-tone] .ng-quick-icon { color:inherit; }
/* Build H3 Prompt: the card's one AI action, and the only place it produces text. */
.ng-studio-context[data-media=text] .ng-build-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.ng-studio-context[data-media=text] .ng-build-row select { flex:1 1 190px; min-width:0; }
.ng-studio-context[data-media=text] .ng-build-row input[type=number] { flex:none; width:74px; }
.ng-studio-context[data-media=text] .ng-build-go { display:flex; align-items:center; gap:7px; flex:none;
  background:#5b3bbf; border-color:#7c5be0; color:#fff; }
.ng-studio-context[data-media=text] .ng-build-icon { width:15px; height:15px; }
.ng-studio-context[data-media=text] .ng-build-answer { width:100%; min-height:150px; margin-top:8px;
  font:12px/1.55 ui-monospace,monospace; background:#060d17; border:1px solid #24406b; border-radius:8px; padding:9px 10px; }
.ng-studio-context[data-media=text] .ng-build-answer[hidden] { display:none; }
.ng-studio-context[data-media=text] .ng-build-actions { display:flex; gap:6px; margin-top:8px; }
.ng-studio-context[data-media=text] .ng-build-use { background:#1c4f3f; border-color:#2a7a5f; color:#d6f5e6; }
/* Use As on the right reads as a list of radios rather than a stack of small checkboxes. */
.ng-studio-context[data-media=text] .ng-text-sidebar .ng-option-row { display:flex; align-items:center; gap:9px; padding:5px 7px; font-size:12px; border-radius:7px; }
.ng-studio-context[data-media=text] .ng-text-sidebar .ng-option-row input { width:15px; height:15px; accent-color:#4a9eff; }
/* The analysis result is a quote: an orange rule on the left, like the reference's Preview block. */
.ng-studio-context[data-media=text] .ng-text-sidebar .ng-suggestion { border-left:3px solid #f59e0b; padding:8px 10px; background:#1a1405; color:#f0e2c0; border-radius:0 8px 8px 0; }
.ng-studio-context[data-media=text] .ng-text-sidebar .ng-suggestion:empty { display:none; }
.ng-studio-context[data-media=text] .ng-text-sidebar .ng-tools { display:flex; gap:4px; flex-wrap:wrap; }
.ng-studio-context[data-media=text] .ng-text-sidebar .ng-tools button { font-size:11px; padding:5px 6px; }
/* Preset: Save and Save As are the purple primary actions, Load stays a quiet secondary button.
   The analysis panel above also uses .ng-tools, so the row is picked out by the preset name field
   that only it has - a button index would also repaint the neighbouring panel's Cancel button. */
.ng-studio-context[data-media=text] .ng-text-sidebar .ng-tools:has(> input) button { background:#5b3bbf; border-color:#7c5be0; color:#fff; }
.ng-studio-context[data-media=text] .ng-text-sidebar .ng-tools:has(> input) button:last-child { background:#0d1c30; border-color:#24406b; color:#9fb6d4; }
.ng-studio-context[data-media=text] .ng-text-sidebar .ng-muted { font-size:11px; }
/* A bracket token is coloured by its kind; an unknown name keeps the neutral placeholder colour so it
   never looks like a field that exists. */
.ng-studio-context[data-media=text] .ng-template-placeholder { color:#e2b887; }
.ng-studio-context[data-media=text] .ng-template-placeholder[data-tone] { font-weight:600; }
`;

let injected = false;

export function ensureContextTextStyle() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.id = "ng-context-text-style";
  style.textContent = CSS;
  document.head.append(style);
}