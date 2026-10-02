import { element,values,applyValues } from "./ng_widgets.js";
import { readPayload,connectedProvider } from "./ng_read.js";
import { aiAction } from "./ng_ai_request.js";
const { app } = window.comfyAPI.app;

export function directionTools(node,api) {
  const root=element("div","ng-direction-tools"),auto=element("button","ng-secondary","✨ Auto Direct"),apply=element("button","ng-secondary","Apply scene suggestion");
  const preview=element("pre","ng-direction-preview"),status=element("span","ng-muted"),cancel=element("button","ng-secondary","Cancel AI");root.append(auto,apply,cancel,status,preview);
  let suggestion=null,snapshot="",busy=false,error="",controller=null;
  function fingerprint(){return JSON.stringify([readPayload(node),connectedProvider(node)]);}
  function sync(){const provider=connectedProvider(node);auto.disabled=busy||!provider;apply.disabled=!suggestion||snapshot!==fingerprint()||!provider;
    cancel.hidden=!busy;if(!busy&&!suggestion)status.textContent=error||(provider?`AI Assist · ${provider.model||provider.provider}`:"AI off · connect H3 AI Loader to the Connector");}
  auto.onclick=async()=>{const provider=connectedProvider(node);if(!provider)return;busy=true;error="";suggestion=null;snapshot=fingerprint();controller=new AbortController();sync();status.textContent="Planning scene suggestion…";
    try{const data=await aiAction(app,api,"direct",{...readPayload(node),provider},controller.signal);suggestion=data.suggestion;
      preview.textContent=suggestion.shots+"\n\nSoundscape: "+suggestion.soundscape+"\nMusic: "+suggestion.music;status.textContent="Review the suggestion, then Apply.";
    }catch(failure){error=failure.message;status.textContent=error;}finally{busy=false;sync();}};
  apply.onclick=()=>{if(snapshot!==fingerprint()){status.textContent="Project changed; request a fresh scene suggestion.";suggestion=null;sync();return;}
    applyValues(node,suggestion);node.graph?.change();suggestion=null;preview.textContent="";status.textContent="Applied · edit any shot or timing.";sync();};
  cancel.onclick=()=>controller?.abort();
  sync();return {root,sync,dispose(){controller?.abort();}};
}
