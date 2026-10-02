// Visual layout from the NG specification: quiet surfaces, compact sections and progressive disclosure.
const CSS = `
.ng-studio { --ng-accent:#73aaa8; --ng-surface:#24282e; --ng-line:#3b424b; box-sizing:border-box; width:100%; height:100%;
  overflow:auto; color:#e4e8ed; background:#202329; border:1px solid var(--ng-line); border-radius:10px; padding:14px;
  font:13px/1.45 Inter,system-ui,sans-serif; }
.ng-studio *, .ng-studio-context * { box-sizing:border-box; }
.ng-studio .ng-header, .ng-studio-context .ng-header { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.ng-studio .ng-header strong { font-size:16px; font-weight:650; letter-spacing:.02em; }
.ng-studio .ng-header { position:sticky; top:-14px; z-index:3; background:#202329; padding:8px 0; flex-wrap:wrap; }
.ng-studio .ng-header .ng-button { font-size:12px; padding:6px 8px; }
.ng-studio .ng-status { color:#a7b4c3; font-size:11px; }
.ng-studio .ng-toolbar { display:flex; gap:4px; margin:12px 0; padding:3px; background:#161a20; border-radius:7px; }
.ng-studio .ng-toolbar button { flex:1; border:0; background:transparent; color:#a8b2c0; padding:6px; border-radius:5px; cursor:pointer; }
.ng-studio .ng-toolbar button[aria-pressed=true] { background:#35454f; color:#e5f1f0; }
.ng-section { margin:12px 0; padding-top:10px; border-top:1px solid var(--ng-line,#3b424b); }
.ng-section-title { font-size:11px; font-weight:650; letter-spacing:.09em; text-transform:uppercase; margin:0 0 9px; color:#adbac7; }
.ng-field { display:flex; flex-direction:column; gap:4px; margin:7px 0; flex:1; min-width:0; }
.ng-field-label { font-size:11px; color:#aeb8c5; }
.ng-studio input, .ng-studio select, .ng-studio textarea, .ng-studio-context input, .ng-studio-context select, .ng-studio-context textarea {
  width:100%; font:inherit; color:#e5e9ee; background:#181d23; border:1px solid #3a424d; border-radius:6px; padding:7px 8px; min-width:0; }
.ng-studio textarea, .ng-studio-context textarea { resize:vertical; min-height:72px; }
.ng-studio input:focus, .ng-studio textarea:focus, .ng-studio-context input:focus { outline:1px solid var(--ng-accent,#73aaa8); }
.ng-studio .ng-row, .ng-studio-context .ng-row { display:flex; gap:10px; }
.ng-actions { display:flex; gap:7px; align-items:center; flex-wrap:wrap; margin:8px 0; }
.ng-button { font:inherit; border:1px solid #52656c; border-radius:6px; padding:7px 11px; color:#ebf5f4; background:#3a555b; cursor:pointer; }
.ng-secondary { background:#293039; border-color:#444e5b; color:#c6d0da; }
.ng-studio button:disabled, .ng-studio-context button:disabled { opacity:.45; cursor:default; }
.ng-muted { color:#a5b0bd; font-size:12px; margin:5px 0; }
.ng-context-list { display:flex; flex-wrap:wrap; gap:6px; }
.ng-context-chip { display:inline-flex; gap:6px; align-items:center; border:1px solid #46515e; border-radius:6px; padding:5px 8px; background:#282e36; font-size:12px; }
.ng-context-chip::before { content:""; width:7px; height:7px; background:var(--context-color,#73aaa8); border-radius:50%; }
.ng-shot-cards { display:flex; gap:9px; overflow:auto; padding-bottom:4px; }
.ng-shot-card { flex:0 0 220px; padding:10px; background:#292f37; border:1px solid #414b57; border-radius:8px; }
.ng-shot-header { display:flex; align-items:center; justify-content:space-between; color:#b9c6d2; font-size:11px; }
.ng-icon-button { border:0; background:transparent; color:#abb9c6; font:18px system-ui; cursor:pointer; }
.ng-shot-times { display:flex; gap:8px; margin:7px 0; }
.ng-shot-times input { font-size:11px; padding:4px; }
.ng-shot-card textarea { min-height:82px; font-size:12px; }
.ng-track-label { font-size:10px; font-weight:500; color:#9caebe; margin:10px 0 4px; }
.ng-story-timeline { position:relative; height:32px; background:#151b22; border-radius:5px; overflow:hidden; }
.ng-story-block { position:absolute; height:100%; min-width:8px; background:#46666c; border:1px solid #78a09f; border-radius:4px;
  padding:5px 10px; font-size:11px; cursor:grab; touch-action:none; }
.ng-time-handle { position:absolute; top:0; bottom:0; width:7px; cursor:ew-resize; }
.ng-time-start { left:0; } .ng-time-end { right:0; }
.ng-generation-track { display:flex; gap:2px; height:22px; }
.ng-chunk-block { text-align:center; padding:2px; background:#344151; border-radius:3px; color:#c0ccdc; font-size:10px; }
.ng-studio details, .ng-studio-context details { border-top:1px solid #3b424b; padding-top:7px; margin-top:9px; }
.ng-studio summary, .ng-studio-context summary { cursor:pointer; color:#becbd7; font-size:12px; }
.ng-studio .ng-plan-summary { background:#2b353e; border-radius:6px; padding:8px 10px; font-size:12px; margin:8px 0; }
.ng-studio .ng-warning { color:#e0bd80; font-size:11px; margin:5px 0; white-space:pre-wrap; }
.ng-studio .ng-error, .ng-studio-context .ng-error { color:#ed9d98; white-space:pre-wrap; }
.ng-studio pre { font:11px/1.5 monospace; white-space:pre-wrap; color:#c3d2df; }
.ng-studio .ng-live-preview { display:block; max-height:130px; max-width:100%; border-radius:6px; margin:7px auto; }
.ng-studio .ng-live-preview[hidden] { display:none; }
.ng-studio[data-mode=simple] .ng-guided, .ng-studio[data-mode=simple] .ng-expert,
.ng-studio[data-mode=guided] .ng-expert { display:none; }
.ng-studio-context { --ng-accent:#73aaa8; box-sizing:border-box; width:100%; height:100%; overflow:auto; background:#20252c;
  color:#e4e8ed; border:1px solid #444e5b; border-radius:9px; padding:11px; font:12px/1.45 Inter,system-ui,sans-serif; }
.ng-studio-context .ng-context-title { font-weight:600; font-size:14px; }
.ng-studio-context .ng-context-caption { color:#adb9c7; font-size:11px; margin-top:5px; }
.ng-studio-context .ng-thumbnail { display:block; max-width:100%; max-height:145px; margin:8px auto; border-radius:6px; }
.ng-studio-context .ng-waveform { width:100%; height:42px; }
.ng-studio-context .ng-media-preview { max-height:180px; overflow:auto; }
.ng-studio-context .ng-tools { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
.ng-studio-context .ng-tools input, .ng-studio-context .ng-tools select { flex:1; min-width:100px; }
.ng-studio-context button { font:inherit; color:#dbe5ee; background:#303f4a; border:1px solid #4a5a67; border-radius:5px; padding:5px 8px; cursor:pointer; }
.ng-studio-context .ng-suggestion { white-space:pre-wrap; border-left:2px solid #a88abd; padding:7px; margin:7px 0; }
.ng-studio-context .ng-status { font-size:11px; color:#c4bd9f; white-space:pre-wrap; }
.ng-studio-context label input[type=checkbox] { width:auto; }
.ng-studio, .ng-studio-context { --ng-accent:#29b9ff; --ng-line:#284260; color:#e5f0ff; background:linear-gradient(145deg,#0c1829,#121829);
  border:1px solid var(--ng-accent); border-radius:13px; padding:16px; font:14px/1.45 Inter,system-ui,sans-serif;
  box-shadow:inset 0 0 18px #142d462e; }
.ng-studio .ng-header, .ng-studio-context .ng-header { background:linear-gradient(100deg,#122b43,#201b38); padding:13px; border:1px solid #345277; border-radius:11px; }
.ng-studio .ng-header strong, .ng-studio-context .ng-context-title { font-size:23px; letter-spacing:.025em; color:#f0f5ff; }
.ng-studio-context .ng-context-name { font-size:16px; color:#91b8ee; margin:3px 0; }
.ng-studio-context[data-expanded=false] { padding:10px; }
.ng-studio-context[data-expanded=false] .ng-header { padding:8px; gap:6px; }
.ng-studio-context[data-expanded=false] .ng-context-title { font-size:14px; letter-spacing:0; }
.ng-studio-context[data-expanded=false] .ng-context-name { font-size:13px; }
.ng-studio-context[data-expanded=false] .ng-ai-badge { font-size:10px; padding:3px 5px; }
.ng-studio-context[data-expanded=false] button { font-size:11px; padding:4px 6px; }
.ng-ai-badge { border:1px solid #c99735; color:#f6d26e; background:#40321355; border-radius:12px; padding:6px 10px; font-size:12px; white-space:nowrap; }
.ng-studio .ng-toolbar { background:#0a1628; border:1px solid #294a6c; }
.ng-studio .ng-toolbar button[aria-pressed=true], .ng-segments button[aria-pressed=true] { background:linear-gradient(#1592ff,#0063dc); color:#fff; border-color:#49c6ff; box-shadow:0 0 9px #087dff60; }
.ng-section { border:1px solid var(--ng-line,#284260); border-radius:10px; padding:12px; margin:10px 0; background:linear-gradient(120deg,#10243b80,#0b162480); }
.ng-section-title { color:#99d4ff; font-size:13px; letter-spacing:.03em; }
.ng-studio input,.ng-studio textarea,.ng-studio select,.ng-studio-context input,.ng-studio-context textarea,.ng-studio-context select { background:#0a1627; border-color:#2a4c71; border-radius:8px; }
.ng-studio button,.ng-studio-context button { color:#d9e9ff; background:linear-gradient(140deg,#183859,#10243e); border:1px solid #315d87; border-radius:7px; cursor:pointer; padding:7px 11px; }
.ng-studio .ng-button { background:linear-gradient(110deg,#ff992d,#ec397e); color:#fff; border-color:#ffaf6d; font-weight:600; }
.ng-context-top { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(190px,1fr); gap:12px; align-items:start; }
.ng-context-bottom { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.ng-option-row { display:flex; align-items:center; gap:10px; padding:7px 3px; color:#d5e6ff; }
.ng-option-row input[type=checkbox],.ng-option-row input[type=radio] { width:19px; height:19px; accent-color:#048eff; margin:0; }
.ng-preserve-row { display:flex; justify-content:space-between; align-items:center; gap:9px; padding:6px 0; }
.ng-segments { display:flex; }
.ng-segments button { padding:5px 9px; font-size:12px; border-radius:0; }
.ng-segments button:first-child { border-radius:7px 0 0 7px; } .ng-segments button:last-child { border-radius:0 7px 7px 0; }
.ng-media-editor { border:1px solid #254768; border-radius:10px; padding:8px; margin-top:10px; overflow:hidden; }
.ng-source-preview { display:block; width:100%; max-height:300px; object-fit:contain; border-radius:8px; }
img.ng-source-preview { cursor:zoom-in; }
.ng-image-dialog { background:#0b1321; border:1px solid #50a7ff; padding:8px; max-width:90vw; max-height:90vh; }
.ng-image-dialog img { max-width:85vw; max-height:85vh; }
.ng-wave-container { position:relative; width:100%; height:106px; overflow:hidden; border:1px solid #294e7b; background:#10162b; }
.ng-wave-container { overflow-x:auto; } .ng-wave-track { position:relative; height:100px; min-width:100%; }
.ng-studio-context .ng-waveform { display:block; width:100%; height:100px; }
.ng-wave-selection { position:absolute; top:0; bottom:0; background:#278cff30; border:1px solid #6094ff; pointer-events:none; }
.ng-wave-handle { position:absolute; top:0; bottom:0; width:10px; background:#6195ff80; cursor:ew-resize; pointer-events:auto; touch-action:none; }
.ng-text-workspace { display:grid; grid-template-columns:minmax(0,1fr) 190px; gap:10px; }
.ng-studio-context[data-media=text] .ng-context-top { grid-template-columns:minmax(0,1fr) 220px; }
.ng-studio-context[data-media=text] .ng-text-workspace { grid-template-columns:1fr; }
.ng-studio-context[data-media=text] .ng-text-workspace .ng-section:nth-child(n+2) { display:flex; flex-wrap:wrap; gap:7px; }
.ng-studio-context[data-media=text] .ng-text-workspace .ng-section-title { flex-basis:100%; }
.ng-studio-context[data-media=text] .ng-quick-insert { width:auto; flex:1 0 130px; margin:0; }
.ng-text-workspace .ng-section:nth-child(n+3) { grid-column:1/-1; }
.ng-text-workspace textarea { min-height:250px; font:14px/1.6 ui-monospace,monospace; }
.ng-text-count { display:block; text-align:right; color:#84a3c4; font-size:11px; }
.ng-text-highlight { white-space:pre-wrap; font:12px/1.5 ui-monospace,monospace; max-height:100px; overflow:auto; }
.ng-text-token { color:#6ccbff; } .ng-text-token:nth-child(4n+2) { color:#e898d1; }
.ng-reference-unknown { color:#ffc273; text-decoration:underline wavy; }
.ng-quick-insert { display:block; width:100%; margin:7px 0; text-align:left; }
.ng-connector-groups { display:grid; gap:7px; }
.ng-connector-group { display:flex; justify-content:space-between; gap:12px; border:1px solid #2b5369; padding:9px; border-radius:8px; }
.ng-connector-group strong { color:#76e3d7; }
.ng-context-chip { display:flex; flex-direction:column; align-items:flex-start; min-width:120px; width:145px; padding:8px; background:#132339; border-color:var(--context-color,#37627f); }
.ng-context-chip::before { display:none; }
.ng-context-chip img,.ng-context-chip video { width:100%; height:75px; object-fit:cover; border-radius:5px; margin-top:5px; }
.ng-context-chip small { font-size:10px; color:#9ab4d0; }
.ng-context-chip audio { width:130px; height:27px; margin-top:7px; }
.ng-shot-card { background:#12263c; border-color:#29638e; width:235px; flex-basis:235px; }
.ng-shot-thumbnail { width:100%; height:70px; object-fit:cover; border-radius:5px; margin:7px 0; }
.ng-story-block { background:linear-gradient(#106cc2,#214e87); border-color:#40b4ff; }
.ng-audio-track { display:flex; gap:10px; align-items:center; padding:5px 0; font-size:11px; }
.ng-audio-track span { width:100px; } .ng-audio-track audio { flex:1; height:28px; min-width:0; }
.ng-generation-cards { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.ng-generation-card { flex:1; min-width:140px; padding:11px; border:1px solid #285174; border-radius:9px; background:#10263b; }
.ng-generation-card strong { display:block; font-size:14px; } .ng-generation-card small { color:#8fabca; }
.ng-studio[data-mode=guided] details.ng-expert { display:block; }
.ng-subtitle { display:block; margin:-6px 0 4px; color:#9aa6bb; font-size:12px; }
.ng-source-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
.ng-source-card { display:flex; align-items:center; gap:9px; text-align:left; cursor:pointer;
  padding:10px; border:1px solid #38455c; border-radius:9px; background:#141d2e; color:#d6dceb; }
.ng-source-card:hover { border-color:#5d6f92; background:#18243a; }
.ng-source-card[aria-pressed=true] { border-color:#a77cff; background:#241a44; box-shadow:inset 0 0 0 1px #a77cff; }
.ng-source-icon { font-size:19px; line-height:1; }
.ng-source-text { display:flex; flex-direction:column; min-width:0; }
.ng-source-text strong { font-size:13px; font-weight:650; }
.ng-source-text small { color:#93a1ba; font-size:11px; white-space:normal; }
.ng-ai-badge { border:1px solid #6a5aa8; border-radius:6px; padding:4px 9px; color:#cbb6ff; background:#231a44; font-size:11px; }
.ng-studio-context details summary { cursor:pointer; padding:8px 10px; border:1px solid #38455c; border-radius:8px;
  background:#141d2e; color:#c3b0f5; font-size:12px; list-style:none; }
.ng-studio-context details[open] summary { margin-bottom:8px; border-color:#5b4a91; }
.ng-studio-context .ng-row .ng-field { margin:4px 0; }
.ng-studio-context input[type=checkbox] { width:16px; height:16px; accent-color:#a77cff; }
/* A capability is one line: caption left, box right. Stacked it opened a gap the size of the field. */
.ng-studio-context .ng-field:has(input[type=checkbox]) { flex-direction:row; align-items:center; justify-content:space-between;
  gap:8px; padding:7px 9px; border:1px solid #2f3c54; border-radius:7px; background:#141d2e; }
.ng-studio-context .ng-field:has(input[type=checkbox]) .ng-field-label { flex:1; }
/* LiteGraph lays the DOM widget out after the panel is built, so a percentage width measured
   during the first computeSize is 0 and the measured height is nonsense. Pin a floor that stays
   below the node's real widget width, or the panel grows a horizontal scrollbar. */
/* LiteGraph hands a DOM widget the space the node gained, but the panel inside still has to grow
   into it. The root is a flex column so the body takes exactly the height left under the sticky
   header, and the last panel absorbs the slack: a taller node shows more panel, not a dead gap. */
.ng-studio-context:has(.ng-panel-body) { display:flex; flex-direction:column; }
.ng-panel-body { width:100%; min-width:300px; flex:1 1 auto; display:flex; flex-direction:column; }
/* Two stacked hint lines in one section need a gap, or the sentences run together. */
.ng-section > .ng-muted { display:block; margin:4px 0; }
`;

export function ensureStudioStyle() {
  if (document.getElementById("ng-studio-style")) return;
  const style = document.createElement("style"); style.id = "ng-studio-style"; style.textContent = CSS; document.head.append(style);
}
