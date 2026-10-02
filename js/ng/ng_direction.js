import { element,values,applyValues } from "./ng_widgets.js";
import { readPayload,connectedProvider } from "./ng_read.js";
import { aiAction } from "./ng_ai_request.js";
import { canAutoDirect, MODES } from "./ng_assist.js";
const { app } = window.comfyAPI.app;

// The mode is workflow state on the node, so a reload keeps the same choice. It gates what the AI may start.
function modeBar(node, state) {
  const bar=element("div","ng-modebar");
  for(const mode of MODES){
    const button=element("button","",mode[0].toUpperCase()+mode.slice(1));button.dataset.mode=mode;
    button.title={manual:"You type every field; no AI request is sent.",
      assist:"The AI suggests, you choose the fields and press Apply.",
      auto:"The AI may plan a whole scene; you still press Apply."}[mode];
    button.onclick=()=>{state.mode=mode;node.properties.ng_assist_mode=mode;state.sync();node.graph?.change();};
    bar.append(button);
  }
  return bar;
}

export function directionTools(node,api) {
  const root=element("div","ng-direction-tools");
  const auto=element("button","ng-secondary","✨ Auto Direct"),apply=element("button","ng-secondary","Apply scene suggestion");
  const preview=element("pre","ng-direction-preview"),status=element("span","ng-muted"),cancel=element("button","ng-secondary","Cancel AI");
  node.properties||={};
  // One state object: the mode bar, the button states and the request all read the same values.
  const state={mode:node.properties.ng_assist_mode||"assist",busy:false,suggestion:null,error:"",snapshot:"",controller:null};
  const bar=modeBar(node,state);
  root.append(bar,auto,apply,cancel,status,preview);
  function fingerprint(){return JSON.stringify([readPayload(node),connectedProvider(node)]);}
  function sync(){
    const provider=connectedProvider(node);
    // Manual never starts a scene proposal; only Auto does, and only with a connected loader.
    auto.disabled=!canAutoDirect(state.mode,provider,state.busy);
    apply.disabled=!state.suggestion||state.snapshot!==fingerprint()||!provider;
    cancel.hidden=!state.busy;
    for(const button of bar.children)button.setAttribute("aria-pressed",String(button.dataset.mode===state.mode));
    if(!state.busy&&!state.suggestion)status.textContent=state.error||(provider?`AI Assist · ${provider.model||provider.provider}`:"AI off · connect H3 AI Loader to the Connector");
    state.sync=sync;
  }
  auto.onclick=async()=>{
    const provider=connectedProvider(node);if(!provider||!canAutoDirect(state.mode,provider))return;
    state.busy=true;state.error="";state.suggestion=null;state.snapshot=fingerprint();state.controller=new AbortController();sync();
    status.textContent="Planning scene suggestion…";
    try{const data=await aiAction(app,api,"direct",{...readPayload(node),provider,mode:state.mode},state.controller.signal);
      state.suggestion=data.suggestion;
      preview.textContent=state.suggestion.shots+"\n\nSoundscape: "+state.suggestion.soundscape+"\nMusic: "+state.suggestion.music;
      // A line the user typed is kept by the backend; the panel says so instead of silently changing the plan.
      status.textContent=state.suggestion.kept_dialogue?.length
        ? `Review, then Apply. Kept your dialogue: ${state.suggestion.kept_dialogue.join(" / ")}`
        : "Review the suggestion, then Apply.";
    }catch(failure){state.error=failure.message;status.textContent=state.error;}finally{state.busy=false;sync();}
  };
  apply.onclick=()=>{
    if(state.snapshot!==fingerprint()){status.textContent="Project changed; request a fresh scene suggestion.";state.suggestion=null;sync();return;}
    // Only the three planned fields are written; kept_dialogue is a report, not a widget.
    applyValues(node,{shots:state.suggestion.shots,soundscape:state.suggestion.soundscape,music:state.suggestion.music});
    node.graph?.change();state.suggestion=null;preview.textContent="";status.textContent="Applied · edit any shot or timing.";sync();
  };
  cancel.onclick=()=>state.controller?.abort();
  sync();return {root,sync,dispose(){state.controller?.abort();}};
}
