import { element,values,applyValues,request } from "./ng_widgets.js";
import { readPayload,connectedProvider } from "./ng_read.js";

export function directionTools(node,api) {
  const root=element("div","ng-direction-tools"),auto=element("button","ng-secondary","✨ Auto Direct"),apply=element("button","ng-secondary","Apply scene suggestion");
  const preview=element("pre","ng-direction-preview"),status=element("span","ng-muted");root.append(auto,apply,status,preview);
  let suggestion=null,snapshot="",busy=false,error="";
  function fingerprint(){return JSON.stringify(readPayload(node));}
  function sync(){const provider=connectedProvider(node);auto.disabled=busy||!provider;apply.disabled=!suggestion||snapshot!==fingerprint()||!provider;
    if(!busy&&!suggestion)status.textContent=error||(provider?`AI Assist · ${provider.model||provider.provider}`:"AI off · connect H3 AI Loader to the Connector");}
  auto.onclick=async()=>{const provider=connectedProvider(node);if(!provider)return;busy=true;error="";suggestion=null;snapshot=fingerprint();sync();status.textContent="Planning scene suggestion…";
    try{const data=await request(api,"/ng/direct",{...readPayload(node),provider});suggestion=data.suggestion;
      preview.textContent=suggestion.shots+"\n\nSoundscape: "+suggestion.soundscape+"\nMusic: "+suggestion.music;status.textContent="Review the suggestion, then Apply.";
    }catch(failure){error=failure.message;status.textContent=error;}finally{busy=false;sync();}};
  apply.onclick=()=>{if(snapshot!==fingerprint()){status.textContent="Project changed; request a fresh scene suggestion.";suggestion=null;sync();return;}
    applyValues(node,suggestion);node.graph?.change();suggestion=null;preview.textContent="";status.textContent="Applied · edit any shot or timing.";sync();};
  sync();return {root,sync};
}
