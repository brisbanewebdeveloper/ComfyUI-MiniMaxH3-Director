// One stylesheet for the NG nodes. Colours come from ComfyUI's own variables so it follows the theme.

const CSS = `
.ng-plan { box-sizing: border-box; width: 100%; font: 12px/1.45 var(--font-inter, system-ui, sans-serif); color: var(--input-text, #ddd);
  background: var(--comfy-input-bg, #222); border: 1px solid var(--border-color, #444); border-radius: 6px; padding: 8px; overflow: auto; }
.ng-plan h4 { margin: 0 0 4px; font-size: 12px; font-weight: 600; }
.ng-plan .ng-summary { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 6px; }
.ng-plan .ng-pill { padding: 1px 8px; border-radius: 10px; background: var(--comfy-menu-bg, #353535); }
.ng-plan .ng-error { color: #ff7b72; white-space: pre-wrap; }
.ng-plan ul { margin: 0 0 6px; padding-left: 16px; }
.ng-plan li.ng-issue { color: #e3b341; }
.ng-plan details { margin: 2px 0; border-top: 1px solid var(--border-color, #444); padding-top: 2px; }
.ng-plan summary { cursor: pointer; }
.ng-plan .ng-dim { opacity: .65; }
.ng-plan pre { margin: 4px 0; white-space: pre-wrap; font: 11px/1.4 var(--font-mono, monospace); }
.ng-plan .ng-bar { display: flex; height: 8px; margin: 4px 0 8px; border-radius: 4px; overflow: hidden; background: var(--comfy-menu-bg, #353535); }
.ng-plan .ng-seg { height: 100%; border-right: 1px solid var(--comfy-input-bg, #222); }
`;

let injected = false;

export function ensureStyle() {
  if (injected) return;
  const tag = document.createElement("style");
  tag.textContent = CSS;
  document.head.appendChild(tag);
  injected = true;
}
