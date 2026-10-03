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
.ng-studio-context[data-media=text] .ng-text-workspace { display:grid; grid-template-columns:minmax(0,2.4fr) minmax(240px,.9fr); gap:12px; align-items:start; }
.ng-studio-context[data-media=text] .ng-text-main, .ng-studio-context[data-media=text] .ng-text-sidebar { display:flex; flex-direction:column; gap:12px; min-width:0; }
/* The rounded mark from the reference and the AI Loader node. It sits in the header as its own tile
   instead of inside the title text, so "T" reads as the card's sign and the title reads as words. */
.ng-studio-context[data-media=text] .ng-header > div:first-child { display:flex; align-items:center; gap:11px; flex-wrap:wrap; }
.ng-studio-context[data-media=text] .ng-context-badge { display:flex; align-items:center; justify-content:center; flex:none;
  width:44px; height:44px; border-radius:11px; border:1px solid #3d7ee0; background:#12233f; color:#6ea8f5;
  font:700 25px/1 Inter,system-ui,sans-serif; }
.ng-studio-context[data-media=text] .ng-context-title { font-size:22px; }
.ng-studio-context[data-media=text] .ng-context-tools { display:flex; align-items:center; gap:6px; margin-left:auto; }
/* Analyze now lives in the header, so it wears the amber pill the reference shows there. */
.ng-studio-context[data-media=text] .ng-context-tools .ng-tools button { border:1px solid #7a5a1c; color:#f6d26e;
  background:#2a2110; border-radius:8px; padding:6px 11px; font-size:12px; }
/* The name sits above the two columns, framed by the parentheses of the reference. */
.ng-studio-context[data-media=text] .ng-context-details > .ng-field:first-child { display:flex; align-items:center; gap:4px; }
.ng-studio-context[data-media=text] .ng-context-details > .ng-field:first-child .ng-field-label { display:none; }
.ng-studio-context[data-media=text] .ng-context-details > .ng-field:first-child::before { content:"("; color:#7fb4f0; font-size:17px; }
.ng-studio-context[data-media=text] .ng-context-details > .ng-field:first-child::after { content:")"; color:#7fb4f0; font-size:17px; }
.ng-studio-context[data-media=text] .ng-context-details > .ng-field:first-child input { text-align:center; }
.ng-studio-context[data-media=text] .ng-text-workspace textarea { min-height:250px; font:14px/1.6 ui-monospace,monospace; }
/* The duplicate "Context text" label: the panel heading right above already names this field. The
   element stays in the DOM so the screen reader still announces it; only the drawn text is dropped. */
.ng-studio-context[data-media=text] .ng-text-unlabelled > .ng-field-label { display:none; }
/* The preview window under the note. It is where the AI result lands, so it stays quiet and empty
   until there is something to show. */
.ng-studio-context[data-media=text] .ng-text-preview-panel .ng-build-answer { margin-top:0; }
.ng-studio-context[data-media=text] .ng-text-preview-analysis:empty { display:none; }
 /* The switch that replaces "Use this prompt" / "Restore my text". It sits at the top of the preview
    panel and reads as one control with two positions, so the chosen side is the only state shown. */
 .ng-studio-context[data-media=text] .ng-text-switch { display:inline-flex; gap:2px; padding:3px; margin-bottom:8px;
   background:#0d1526; border:1px solid #24344f; border-radius:9px; }
 .ng-studio-context[data-media=text] .ng-text-switch-btn { border:0; background:transparent; color:#8fa8c6;
   font-size:11px; font-weight:600; padding:6px 12px; border-radius:7px; cursor:pointer; }
 .ng-studio-context[data-media=text] .ng-text-switch-btn:hover:not(:disabled) { color:#dbe7f7; background:#1b2942; }
 .ng-studio-context[data-media=text] .ng-text-switch[data-mode=note] .ng-text-switch-btn:first-child,
 .ng-studio-context[data-media=text] .ng-text-switch[data-mode=ai] .ng-text-switch-btn:last-child { background:#243b5e; color:#eaf2ff; }
 .ng-studio-context[data-media=text] .ng-text-switch-btn:disabled { opacity:.4; cursor:default; }
 /* The AI version is read-only, so the textarea says so instead of silently swallowing typing. */
 .ng-studio-context[data-media=text] .ng-text-editor-panel textarea[readonly] { background:#131f36; color:#cfe0f5; }
.ng-studio-context[data-media=text] .ng-text-preview-analysis .ng-suggestion { border-left:3px solid #f59e0b;
  padding:8px 10px; background:#1a1405; color:#f0e2c0; border-radius:0 8px 8px 0; }
.ng-studio-context[data-media=text] .ng-text-preview-analysis .ng-tools { margin:0; }
.ng-studio-context[data-media=text] .ng-text-preview-analysis .ng-tools button { font-size:11px; padding:5px 8px; }
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

/* Use As is gone from this card, and with it the sidebar radios it styled. */
/* Preset: Save and Save As are the purple primary actions, Load stays a quiet secondary button.
   The Build panel above also uses .ng-tools, so the row is picked out by the preset name field
   that only it has - a button index would also repaint the Build panel's Cancel button. */
.ng-studio-context[data-media=text] .ng-text-preset-slot .ng-tools:has(> input) button { background:#5b3bbf; border-color:#7c5be0; color:#fff; }
.ng-studio-context[data-media=text] .ng-text-preset-slot .ng-tools:has(> input) button:last-child { background:#0d1c30; border-color:#24406b; color:#9fb6d4; }
.ng-studio-context[data-media=text] .ng-text-preset-slot .ng-muted { font-size:11px; }
/* Context Color is the one setting the H3 Director reads back, so it gets its own full-width row
   under the two columns instead of being folded away with an identity that is no longer shown. */
.ng-studio-context[data-media=text] .ng-context-details > .ng-section:last-of-type .ng-field { flex-direction:row; align-items:center; gap:8px; }
.ng-studio-context[data-media=text] .ng-context-details > .ng-section:last-of-type .ng-field-label { min-width:150px; }
.ng-studio-context[data-media=text] .ng-context-details > .ng-section:last-of-type input[type=color] { width:42px; height:30px; padding:2px; flex:none; }
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