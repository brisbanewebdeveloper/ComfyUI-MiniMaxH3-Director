// AI actions use the connected loader; loading or connecting a graph makes no provider request.
import { values, applyValues, element,analysisFingerprint } from "./ng_widgets.js";
import { contextProvider } from "./ng_read.js";
import { aiAction } from "./ng_ai_request.js";
import { applyChanges, offeredFields, reasonLine } from "./ng_assist.js";
const { api } = window.comfyAPI.api;
const { app } = window.comfyAPI.app;

const FIELD_LABELS = { description: "Description", content: "Content", usage: "Use as" };

export function attachAnalysis(node, media, root, status) {
  const tools=element("div","ng-tools"), analyze=element("button","","✨ Analyze"), apply=element("button","","Apply suggestion");
  const output=element("div","ng-suggestion"), availability=element("small","ng-muted"),cancel=element("button","","Cancel AI");
  tools.append(analyze,apply,cancel);root.append(availability,tools,output);
  let suggestion=null,snapshot=null,providerSnapshot=null,busy=false,controller=null;
  let picker=null,reason=null,ticks=new Set();
  const fingerprint=()=>JSON.stringify([values(node),contextProvider(node)]);

  // The user picks which fields Apply writes; an unticked field keeps whatever the card already says.
  function buildPicker() {
    picker=element("div","ng-field-picker");ticks=new Set(Object.keys(offeredFields(suggestion)));
    for(const [name,value] of Object.entries(offeredFields(suggestion))) {
      const row=element("label","ng-field-row"),box=element("input");box.type="checkbox";box.checked=true;
      box.setAttribute("aria-label",`${FIELD_LABELS[name]||name}: ${value}`);
      row.append(box,element("span","",`${FIELD_LABELS[name]||name}: ${value}`));
      box.onchange=()=>{box.checked?ticks.add(name):ticks.delete(name);sync();};
      picker.append(row);
    }
    reason=element("small","ng-muted",reasonLine(suggestion));reason.hidden=!reason.textContent;
    picker.append(reason);
  }

  function sync() {
    const provider=contextProvider(node);analyze.disabled=busy||!provider;
    cancel.hidden=!busy;apply.disabled=!suggestion||snapshot!==fingerprint();
    availability.textContent=provider?`AI: ${provider.model||provider.provider} · explicit analysis` : "AI off · connect H3 AI Loader directly or through the Connector.";
    if(!provider)apply.disabled=true;
    if(picker){picker.hidden=!suggestion;apply.disabled=apply.disabled||!ticks.size;}
  }
  analyze.onclick=async()=>{
    const provider=contextProvider(node);if(!provider)return;
    busy=true;suggestion=null;providerSnapshot=provider;snapshot=fingerprint();controller=new AbortController();sync();output.textContent="Analyzing…";
    try{const data=await aiAction(app,api,"analyze",{media,widgets:values(node),provider},controller.signal);suggestion=data.suggestion;
      output.textContent="";picker?.remove();picker=null;buildPicker();root.append(picker);
    }catch(error){output.textContent=error.message;}finally{busy=false;sync();}
  };
  apply.onclick=()=>{
    if(snapshot!==fingerprint()){status.textContent="Context or AI source changed; analyze it again before applying.";sync();return;}
    // Only the ticked fields are written, so usage and preserve the user set stay untouched.
    const changes=applyChanges(suggestion,[...ticks]);
    if(!Object.keys(changes).length){status.textContent="Tick at least one field to apply.";sync();return;}
    applyValues(node,changes);node.properties.ng_analysis={fingerprint:analysisFingerprint(media,values(node)),model:providerSnapshot?.model};
    suggestion=null;picker?.remove();picker=null;status.textContent="Applied the ticked fields. Everything else stays as you set it.";sync();
  };
  cancel.onclick=()=>controller?.abort();
  const connected=node.onConnectionsChange;node.onConnectionsChange=function(...args){const result=connected?.apply(this,args);queueMicrotask(sync);return result;};
  sync();return {sync,dispose(){controller?.abort();}};
}
