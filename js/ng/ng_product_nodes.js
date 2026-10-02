// Product nodes outside the Director: AI Loader, Context Connector, Director Output, Render Sequence.
import { element, values } from "./ng_widgets.js";
import { control, hideNative, section } from "./ng_editor_fields.js";
import { ensureStudioStyle } from "./ng_studio_style.js";
import { connectedProvider, readContexts, restoredProviderValues } from "./ng_read.js";
import { attachProgress } from "./ng_studio_progress.js";
import { compactContextInputs } from "./ng_connector_slots.js";
import { buildPanel } from "./ng_ai_panel.js";

const { app } = window.comfyAPI.app, { api } = window.comfyAPI.api;

function shell(node, title, accent, size) {
  ensureStudioStyle(); node.properties ||= {}; node.color = "#162b45"; node.bgcolor = "#101a2c";
  const root = element("div", "ng-studio-context"); root.style.setProperty("--ng-accent", accent);
  const header = element("div", "ng-header"); header.append(element("strong", "ng-context-title", title)); root.append(header);
  const widget = node.addDOMWidget("ng_product", "ng_product", root, { serialize: false, hideOnZoom: false });
  widget.computeSize=undefined;
  // Only the minimum width is fixed; the height comes from the panel, which measures its own
  // content. The panel sizes itself through computeLayoutSize, so fall back to the passed minimum
  // here instead of asking for a computeSize that a DOM panel no longer defines.
  const configured = node.onConfigure; node.onConfigure = function (...args) { const result = configured?.apply(this, args);
    node.setSize([Math.max(size[0], node.size[0]), Math.max(size[1], node.size[1])]); return result; };
  return { root, header, widget };
}

function provider(node) {
  const { root, header, widget } = shell(node, "H3 MODEL LOADER", "#a77cff", [660, 300]);
  const panel = buildPanel(node, root, header, widget);
  const removed=node.onRemoved;node.onRemoved=function(...args){panel.dispose();return removed?.apply(this,args);};
  const configured = node.onConfigure; node.onConfigure = function (...args) { const result = configured?.apply(this, args);
    const restored=restoredProviderValues(args[0]?.widgets_values);
    if(restored)for(const entry of node.widgets||[])if(entry.name in restored)entry.value=restored[entry.name];
    queueMicrotask(() => { panel.sync(); panel.fit(true); }); return result; };
  for (const entry of node.widgets || []) { if (entry === widget) continue; const previous = entry.callback;
    entry.callback = function (...args) { const result = previous?.apply(this, args); panel.sync();
      document.dispatchEvent(new CustomEvent("ng-context-changed")); return result; }; }
}
function connector(node) {
  const {root,header,widget}=shell(node,"↔ H3 CONTEXT CONNECTOR","#57dfb8",[560,800]),status=element("span","ng-ai-badge");header.append(status);
  const groups=element("div","ng-connector-groups");root.append(groups,element("small","ng-muted","Native ports above → one H3 context output. Add inputs by connecting the last empty slot."));
  function sync(){groups.replaceChildren();const entries=readContexts(node);
    compactContextInputs(node);
    for(const [label,kind]of[["Model inputs","models"],["Text context","text"],["Image context","image"],["Video context","video"],["Audio context","audio"]]){
      const row=element("div","ng-connector-group");row.append(element("strong","",label));
      const text=kind==="models"?(node.inputs||[]).filter((input)=>["model_fl2va","model_ref2va","clip","vae","audio_vae"].includes(input.name)&&input.link!=null).length+" connected":entries.filter((entry)=>entry.media===kind).map((entry)=>entry.widgets.name||kind).join(", ")||"Optional";
      row.append(element("span","",text));groups.append(row);}
    const has=(name)=>(node.inputs||[]).some((input)=>input.name===name&&input.link!=null);
    const ready=["clip","vae","audio_vae"].every(has)&&(has("model_fl2va")||has("model_ref2va"));
    status.textContent=ready?(connectedProvider(node)?"Connected · AI available":"Connected · manual"):"Connect models";
    for(const input of node.inputs||[]){const match=/^context_(\w+)\.\w+_(\d+)$/.exec(input.name);if(match)input.label=`context ${match[1]} ${Number(match[2])+1}`;}
  }
  const connected=node.onConnectionsChange;node.onConnectionsChange=function(...args){const result=connected?.apply(this,args);queueMicrotask(sync);return result;};
  const configured=node.onConfigure;node.onConfigure=function(...args){const result=configured?.apply(this,args);queueMicrotask(sync);return result;};
  document.addEventListener("ng-context-changed",sync);
  const removed=node.onRemoved;node.onRemoved=function(...args){document.removeEventListener("ng-context-changed",sync);return removed?.apply(this,args);};
  widget.computeLayoutSize=()=>({minHeight:315,maxHeight:Number.MAX_SAFE_INTEGER,minWidth:0});node.setSize([560,740]);sync();
}
function output(node) {
  const {root,widget}=shell(node,"➜ H3 DIRECTOR OUTPUT","#e981ed",[440,430]);
  root.append(element("p","ng-muted","Native outputs → your sampler. Sequence → H3 Render Sequence for the whole project."));
  const advanced=element("details");advanced.append(element("summary","","Expert · chunk selection"));const field=control(node,"chunk_index","Chunk index · starts at 0",{number:true});advanced.append(field.label);root.append(advanced);
  hideNative(node,["chunk_index"]);widget.computeLayoutSize=()=>({minHeight:220,maxHeight:Number.MAX_SAFE_INTEGER,minWidth:0});node.setSize([440,430]);
  const configured=node.onConfigure;node.onConfigure=function(...args){const result=configured?.apply(this,args);field.sync();return result;};
}
function render(node) {
  const {root,header,widget}=shell(node,"▶ H3 RENDER SEQUENCE","#5ba9ff",[480,365]),status=element("span","ng-ai-badge","Ready"),preview=element("img","ng-live-preview");preview.hidden=true;preview.alt="Live sampling preview";
  header.append(status);root.append(element("p","ng-muted","Native loop · sampler · continuity · final collect"),preview);
  const progress=attachProgress(node,api,status,preview);widget.computeLayoutSize=()=>({minHeight:200,maxHeight:Number.MAX_SAFE_INTEGER,minWidth:0});node.setSize([480,365]);
  const removed=node.onRemoved;node.onRemoved=function(...args){progress.dispose();return removed?.apply(this,args);};
}
app.registerExtension({name:"mmxd.ng.product_nodes",nodeCreated(node){
  ({NGAIProvider:provider,NGContextConnector:connector,NGDirectorOutput:output,NGProjectRender:render})[node.comfyClass]?.(node);
  if(["NGAIProvider","NGContextConnector","NGDirectorOutput","NGProjectRender"].includes(node.comfyClass)){
    const changed=node.onConnectionsChange;node.onConnectionsChange=function(...args){const result=changed?.apply(this,args);
      document.dispatchEvent(new CustomEvent("ng-context-changed"));return result;};
  }
}});
