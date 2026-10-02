// AI actions use the connected loader; loading or connecting a graph makes no provider request.
import { values, applyValues, element,analysisFingerprint } from "./ng_widgets.js";
import { contextProvider } from "./ng_read.js";
import { aiAction } from "./ng_ai_request.js";
const { api } = window.comfyAPI.api;
const { app } = window.comfyAPI.app;

export function attachAnalysis(node, media, root, status) {
  const tools=element("div","ng-tools"), analyze=element("button","","✨ Analyze"), apply=element("button","","Apply suggestion");
  const output=element("div","ng-suggestion"), availability=element("small","ng-muted"),cancel=element("button","","Cancel AI");
  tools.append(analyze,apply,cancel);root.append(availability,tools,output);
  let suggestion=null,snapshot=null,providerSnapshot=null,busy=false,controller=null;
  const fingerprint=()=>JSON.stringify([values(node),contextProvider(node)]);
  function sync() {
    const provider=contextProvider(node);analyze.disabled=busy||!provider;
    cancel.hidden=!busy;apply.disabled=!suggestion||snapshot!==fingerprint();
    availability.textContent=provider?`AI: ${provider.model||provider.provider} · explicit analysis` : "AI off · connect H3 AI Loader directly or through the Connector.";
    if(!provider)apply.disabled=true;
  }
  analyze.onclick=async()=>{
    const provider=contextProvider(node);if(!provider)return;
    busy=true;suggestion=null;providerSnapshot=provider;snapshot=fingerprint();controller=new AbortController();sync();output.textContent="Analyzing…";
    try{const data=await aiAction(app,api,"analyze",{media,widgets:values(node),provider},controller.signal);suggestion=data.suggestion;
      output.textContent=`${suggestion.content}: ${suggestion.description}`;
    }catch(error){output.textContent=error.message;}finally{busy=false;sync();}
  };
  apply.onclick=()=>{
    if(snapshot!==fingerprint()){status.textContent="Context or AI source changed; analyze it again before applying.";sync();return;}
    const content=node.widgets?.find((widget)=>widget.name==="content"), changes={description:suggestion.description};
    if(content?.options?.values?.includes(suggestion.content)){changes.content=suggestion.content;changes.content_roles=JSON.stringify([suggestion.content]);}
    applyValues(node,changes);node.properties.ng_analysis={fingerprint:analysisFingerprint(media,values(node)),model:providerSnapshot?.model};
    suggestion=null;status.textContent="Applied analysis. Usage and preserve remain editable.";sync();
  };
  cancel.onclick=()=>controller?.abort();
  const connected=node.onConnectionsChange;node.onConnectionsChange=function(...args){const result=connected?.apply(this,args);queueMicrotask(sync);return result;};
  sync();return {sync,dispose(){controller?.abort();}};
}
