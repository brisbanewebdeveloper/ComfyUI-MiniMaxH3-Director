// The Studio's own stylesheet. Every rule is under .h3s / .h3n, so nothing here reaches the Context or product nodes.
const CSS = `
.h3s{position:fixed;inset:0;z-index:2000;overflow:auto;background:#0E1117;color:#E6EAF2;font:14px/1.4 "IBM Plex Sans","Segoe UI",system-ui,sans-serif}
.h3s *{box-sizing:border-box}
.h3s{user-select:none}
.h3s input,.h3s textarea,.h3s pre{user-select:text}
.h3s button,.h3s select,.h3s input,.h3s textarea{font:inherit;color:#E6EAF2}
.h3s-page{min-height:100%;display:flex;flex-direction:column}
.h3s-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:10px 20px;border-bottom:1px solid #222A37;background:#121620;position:sticky;top:0;z-index:5}
.h3s-title{font-weight:700;font-size:17px}
.h3s-muted,.h3s-lbl{color:#9AA4B5}
.h3s-lbl{font-size:12px;letter-spacing:.02em}
.h3s-grow{flex:1 1 auto}
.h3s-btn{min-height:40px;padding:0 14px;border-radius:8px;border:1px solid #344055;background:#1E2633;cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.h3s-btn:hover{background:#273142;border-color:#46546C}
.h3s-btn:disabled{opacity:.45;cursor:not-allowed}
.h3s-btn.ai{border-color:#4B3F78;background:#1F1A33;color:#D6C8FF}
.h3s-btn.ai:hover:not(:disabled){background:#2A2346}
.h3s-btn.go{background:#FF7A45;border-color:#FF7A45;color:#1A0C05;font-weight:700;min-height:44px;padding:0 20px}
.h3s-btn.go:hover:not(:disabled){background:#FF9165}
.h3s-btn.ghost{background:transparent;border-color:transparent;color:#9AA4B5}
.h3s-btn.ghost:hover{color:#E6EAF2;background:#1E2633}
.h3s-btn.small{min-height:30px;padding:0 8px}
.h3s-in{background:#0E1117;border:1px solid #2E3848;border-radius:8px;min-height:40px;padding:0 10px}
.h3s-in:focus{outline:2px solid #8FC1FF;outline-offset:1px}
textarea.h3s-in{padding:10px;line-height:1.45;resize:vertical;width:100%}
.h3s-field{display:flex;flex-direction:column;gap:4px}
.h3s-toast{margin:12px 20px 0;padding:10px 14px;border-radius:8px;background:#1D2A1F;border:1px solid #3C6B44;color:#CDEFD3}
.h3s-body{flex:1 1 auto;display:flex;gap:12px;padding:12px 16px;align-items:flex-start}
.h3s-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:12px}
.h3s-side{flex:0 0 360px;min-width:0;display:flex;flex-direction:column;gap:12px}
@media (max-width:960px){.h3s-body{flex-direction:column;align-items:stretch}.h3s-side{flex:1 1 auto}}
.h3s-card{background:#161B24;border:1px solid #222A37;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0}
.h3s-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.h3s-strong{font-weight:600}
.h3s-content{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.h3s-ctx{position:relative;min-width:0;height:56px;border-radius:10px;border:1px solid #2A3342;background:#161B24;cursor:grab;padding:0;text-align:left;display:flex;align-items:stretch;overflow:hidden}
.h3s-ctx:hover{border-color:#4A5871}
.h3s-ctx.on{border-color:#8FC1FF;box-shadow:0 0 0 1px #8FC1FF}
.h3s-ctx.off{opacity:.4}
.h3s-ctx-visual{flex:0 0 56px;display:flex;align-items:center;justify-content:center;border-right:1px solid #222A37;overflow:hidden}
.h3s-ctx-visual img{width:100%;height:100%;object-fit:cover}
.h3s-ctx-text{padding:6px 10px;display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0}
.h3s-ctx-text>*{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.h3s-badge{position:absolute;top:4px;right:4px;font-size:11px;padding:1px 6px;border-radius:6px;background:#8FC1FF;color:#0E1117;font-weight:600}
.h3s-hint{border-radius:10px;border:1px dashed #344055;display:flex;align-items:center;justify-content:center;padding:6px;text-align:center;color:#9AA4B5;font-size:12px;line-height:1.3}
.h3s-lane{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px;align-items:stretch}
.h3s-lane-name{display:flex;align-items:center;gap:6px;font-size:12px;color:#B4BDCC}
.h3s-ruler{position:relative;height:18px}
.h3s-tick{position:absolute;transform:translateX(-50%);font:11px "IBM Plex Mono",Consolas,monospace;color:#7F8A9C}
.h3s-track{position:relative;border-radius:10px;background:#10141C;border:1px solid #222A37}
.h3s-track.over{border-color:#8FC1FF}
.h3s-grid{position:absolute;top:0;bottom:0;width:1px;background:#1C2230}
.h3s-drop{position:absolute;top:0;bottom:0;width:2px;background:#8FC1FF}
.h3s-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#7F8A9C;font-size:13px;padding:0 12px;text-align:center}
.h3s-shot{position:absolute;top:6px;bottom:6px;border-radius:8px;background:#1C2433;border:1px solid #3A475D;cursor:grab;touch-action:none;overflow:hidden;display:flex;flex-direction:column;padding:6px 14px;gap:4px;user-select:none}
.h3s-shot:hover{border-color:#5B6B86}
.h3s-shot.sel{border-color:#8FC1FF;box-shadow:0 0 0 1px #8FC1FF;background:#1F2B3F}
.h3s-shot.drag{z-index:3;opacity:.92;cursor:grabbing;box-shadow:0 6px 18px rgba(0,0,0,.5),0 0 0 1px #8FC1FF}
.h3s-track.ghosting .h3s-shot:not(.ghost){opacity:.35}
.h3s-shot.ghost{background:transparent;border:1px dashed #9C86F0;cursor:default}
.h3s-shot-text{font-size:12px;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.h3s-chip{font-size:11px;padding:1px 6px;border-radius:5px;white-space:nowrap}
.h3s-grip{position:absolute;top:0;bottom:0;width:10px;cursor:ew-resize;touch-action:none}
.h3s-grip:hover{background:rgba(143,193,255,.25)}
.h3s-clip{position:absolute;top:4px;bottom:4px;border-radius:6px;border:1px solid #4A3E6E;background:#1E1830;cursor:grab;touch-action:none;overflow:hidden;display:flex;align-items:center;gap:6px;padding:0 12px;font-size:12px;user-select:none;white-space:nowrap}
.h3s-clip.sel{border-color:#8FC1FF;box-shadow:0 0 0 1px #8FC1FF}
.h3s-clip.drag{z-index:3;cursor:grabbing}
.h3s-part{position:absolute;top:3px;bottom:3px;border-radius:6px;border:1px solid #2E3848;background:#141922;display:flex;align-items:center;gap:8px;padding:0 10px;font-size:12px;color:#C9D1DE;white-space:nowrap;overflow:hidden}
.h3s-swatch{width:8px;height:8px;border-radius:2px;flex:0 0 auto;display:inline-block}
.h3s-lane-add{width:100%;min-height:32px;border-radius:8px;border:1px dashed #3A4458;background:transparent;color:#9AA4B5;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
.h3s-lane-add:hover,.h3s-lane-add.over{border-color:#8FC1FF;color:#E6EAF2}
.h3s-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:8px;border:1px solid #4B3F78;background:#1B1730;color:#D6C8FF}
.h3s-seg{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;padding:8px 10px;min-height:56px;border-radius:10px;border:1px solid #2E3848;background:#121722;cursor:pointer}
.h3s-seg:hover{border-color:#4A5871}
.h3s-seg.on{border-color:#8FC1FF;background:#18233A;box-shadow:0 0 0 1px #8FC1FF}
.h3s-toggle{display:flex;align-items:center;gap:12px;padding:6px 2px;border:0;background:transparent;cursor:pointer;min-height:44px;text-align:left}
.h3s-switch{width:40px;height:22px;border-radius:11px;background:#2E3848;position:relative;flex:0 0 auto}
.h3s-switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#E6EAF2}
.h3s-switch.on{background:#FF7A45}
.h3s-switch.on::after{left:21px}
.h3s-item{display:flex;align-items:center;gap:8px;border:1px solid #2E3848;border-radius:8px;padding:6px 6px 6px 10px;background:#121722}
.h3s-suggest{border:1px solid #4B3F78;background:#1B1730;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.h3s-foot{border-top:1px solid #222A37;background:#121620;padding:10px 20px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.h3s-foot-row{flex:1 1 100%;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
.h3s-foot-title{width:70px;align-self:center;font-size:12px;font-weight:600;color:#9AA4B5;text-transform:uppercase;letter-spacing:.06em}
.h3s-more{flex:1 1 100%;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;padding:12px;border-radius:10px;border:1px solid #2A3342;background:#161B24}
.h3s-drawer{border-top:1px solid #222A37;background:#0F131B}
.h3s-drawer-head{width:100%;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 20px;min-height:40px;background:transparent;border:0;cursor:pointer;text-align:left}
.h3s-drawer-head:hover{background:#141924}
.h3s-prompts{padding:0 20px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:12px}
.h3s-prompt{border:1px solid;border-radius:10px;background:#10141C;display:flex;flex-direction:column;overflow:hidden}
.h3s-prompt-head{display:flex;align-items:center;gap:8px;padding:8px 12px}
.h3s-prompt pre{margin:0;padding:10px 12px;white-space:pre-wrap;font:12px/1.5 "IBM Plex Mono",Consolas,monospace;color:#D3DAE6}
.h3s-warn{color:#F2B98A}
.h3s-issues{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#F2B98A}
.h3s-live{max-width:260px;max-height:150px;border-radius:8px;border:1px solid #2A3342}
.h3n{display:flex;flex-direction:column;gap:10px;padding:8px 10px 10px;color:#E6EAF2;font:13px/1.4 "IBM Plex Sans","Segoe UI",system-ui,sans-serif}
.h3n *{box-sizing:border-box}
.h3n-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.h3n-tile{border:1px solid #2E3848;border-radius:8px;padding:6px 10px;background:#0E1117}
.h3n-mini{position:relative;height:30px;border-radius:6px;background:#0E1117;border:1px solid #222A37}
.h3n-mini span{position:absolute;top:4px;bottom:4px;border-radius:5px;background:#1F2B3F;border:1px solid #3A475D;font-size:11px;padding:0 6px;display:flex;align-items:center;overflow:hidden;white-space:nowrap}
.h3n-parts{position:relative;height:8px}
.h3n-parts span{position:absolute;top:0;bottom:0;border-radius:4px}
.h3n-open{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border-radius:8px;background:#2B3A55;border:1px solid #4A6290;color:#E6EAF2;font-weight:600;cursor:pointer}
.h3n-open:hover{background:#34476A}
.h3n textarea{width:100%;background:#0E1117;border:1px solid #2E3848;border-radius:8px;color:#D3DAE6;padding:8px 10px;font:inherit;resize:vertical}
`;

export function ensureStudioStyle() {
  if (document.getElementById("h3s-style")) return;
  const style = document.createElement("style");
  style.id = "h3s-style";
  style.textContent = CSS;
  document.head.append(style);
}
