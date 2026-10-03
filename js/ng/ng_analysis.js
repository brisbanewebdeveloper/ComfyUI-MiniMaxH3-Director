// AI actions use the connected loader; loading or connecting a graph makes no provider request.
import { values, applyValues, element,analysisFingerprint } from "./ng_widgets.js";
import { contextProvider } from "./ng_read.js";
import { aiAction } from "./ng_ai_request.js";
import { applyChanges, offeredFields, reasonLine } from "./ng_assist.js";
import { providerEntry } from "./ng_ai_panel.js";
import { mediaHint } from "./ng_ai_capabilities.js";
const { api } = window.comfyAPI.api;
const { app } = window.comfyAPI.app;

const FIELD_LABELS = { description: "Description", content: "Content", usage: "Use as" };

export function attachAnalysis(node, media, root, status) {
  const tools=element("div","ng-tools"), analyze=element("button","","✨ Analyze"), apply=element("button","","Apply suggestion");
  const output=element("div","ng-suggestion"), availability=element("small","ng-muted"),cancel=element("button","","Cancel AI");
  // The reason a medium cannot be analysed belongs here, on the card that holds it - not on the
  // provider dropdown, where the user has to go looking for why their picture refuses to analyse.
  // The sentence comes from the registry and names the alternative that needs no provider at all.
  const refusal=element("small","ng-refusal");
  tools.append(analyze,apply,cancel);root.append(availability,refusal,tools,output);
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
    // The hint belongs on the card that holds the medium, not on the provider dropdown where the user
    // has to go looking for why their picture refuses to analyse. The sentence comes from the
    // registry and names the alternative that needs no provider at all.
    //
    // Only for a known HTTP provider. On CLIP / Encoder nothing is known about the connected model,
    // so there is no fact to state and the user's own switches answer for themselves - and the
    // clip branch of connectedProvider() carries no `provider` id at all. `custom` is skipped too:
    // it stands for "an address I typed myself", so the registry's verdict would be a guess.
    const entry=provider&&provider.source!=="clip"&&provider.provider!=="custom"?providerEntry(provider.provider):null;
    const state=entry&&entry.media&&entry.media[media];
    refusal.textContent=state&&!state.ok?state.hint||mediaHint(entry,media):"";
    refusal.hidden=!refusal.textContent;
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
