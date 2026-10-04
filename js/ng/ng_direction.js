import { element,values,applyValues,nativeAIFingerprint } from "./ng_widgets.js";
import { readPayload,connectedProvider } from "./ng_read.js";
import { aiAction } from "./ng_ai_request.js";
import { canAutoDirect, MODES } from "./ng_assist.js";
import { sceneApplyProblem,readStory } from "./ng_story_model.js";
import { DRAFT_FORMAT,draftChoices,mergeShotDraft,displayDraftValue } from "./ng_shot_draft.js";
const { app } = window.comfyAPI.app;

// The mode is workflow state on the node, so a reload keeps the same choice. It gates what the AI may start.
function modeBar(node, state) {
  const bar=element("div","ng-assistbar");
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
  const auto=element("button","ng-secondary","✨ Auto Direct"),apply=element("button","ng-secondary","Apply selected fields");
  const preview=element("pre","ng-direction-preview"),status=element("span","ng-muted"),cancel=element("button","ng-secondary","Cancel AI");
  const picker=element("div","ng-direction-fields"),discard=element("button","ng-secondary","Discard suggestion");
  node.properties||={};
  // One state object: the mode bar, the button states and the request all read the same values.
  const saved=node.properties.ng_direction_draft;
  const state={mode:node.properties.ng_assist_mode||"assist",busy:false,suggestion:saved?.schema_version===1?saved.suggestion:null,
    selected:saved?.selected||[],error:"",snapshot:saved?.snapshot||"",controller:null,serial:0,removed:false};
  const bar=modeBar(node,state);
  root.append(bar,auto,apply,cancel,discard,status,picker,preview);
  function fingerprint(){
    const provider=connectedProvider(node),loader=provider?.source==="clip"?node.graph.getNodeById(provider.loader_node_id):null;
    return JSON.stringify([readPayload(node),provider,loader?nativeAIFingerprint(loader):null]);
  }
  function persist(){node.properties.ng_direction_draft={schema_version:1,snapshot:state.snapshot,suggestion:state.suggestion,selected:[...state.selected]};node.graph?.change();}
  function clear(){state.suggestion=null;state.selected=[];delete node.properties.ng_direction_draft;picker.replaceChildren();preview.textContent="";}
  function changes(){
    const current=values(node);
    if(state.suggestion?.format===DRAFT_FORMAT)return mergeShotDraft(current.shots||"",state.suggestion,state.selected,Number(current.project_seconds),readPayload(node).contexts);
    const problem=sceneApplyProblem(current.shots||"");if(problem)throw Error(problem);
    if(readStory(current.shots||"").shots.length)throw Error("Existing Shots need an ID-addressed suggestion. Request a fresh draft.");
    const result=Object.fromEntries(state.selected.filter(key=>["shots","soundscape","music"].includes(key)).map(key=>[key,state.suggestion[key]]));
    if(!Object.keys(result).length)throw Error("Select at least one field.");return result;
  }
  function review(restored=false){
    picker.replaceChildren();if(!state.suggestion)return;
    const isDraft=state.suggestion.format===DRAFT_FORMAT,contexts=readPayload(node).contexts;
    const choices=isDraft?draftChoices(values(node).shots||"",state.suggestion):["shots","soundscape","music"].map(field=>({key:field,field,value:state.suggestion[field],locked:false}));
    if(!restored)state.selected=choices.filter(choice=>!choice.locked&&(isDraft?choice.field==="text":true)).map(choice=>choice.key);
    for(const choice of choices){
      const label=element("label","ng-direction-field"),input=element("input");input.type="checkbox";input.disabled=choice.locked;
      const caption=choice.shot_id?`Shot ${choice.number} ${choice.field}`:choice.field;
      input.setAttribute("aria-label",`Apply ${caption}`);input.checked=state.selected.includes(choice.key)&&!choice.locked;
      input.onchange=()=>{state.selected=input.checked?[...new Set([...state.selected,choice.key])]:state.selected.filter(key=>key!==choice.key);persist();sync();};
      label.append(input,element("span","",caption+(choice.locked?" · protected":"")));
      const detail=element("details");detail.append(element("summary","","Compare current / proposed"),
        element("small","ng-muted","Current"),element("pre","ng-direction-preview",displayDraftValue(choice.field,choice.current??values(node)[choice.field],contexts)),
        element("small","ng-muted","Proposed"),element("pre","ng-direction-preview",displayDraftValue(choice.field,choice.value,contexts)));
      picker.append(label,detail);
    }
    preview.textContent=isDraft?"Select the fields to apply. Bindings, dialogue and timing remain until explicitly selected.":state.suggestion.shots;
  }
  function sync(){
    state.mode=node.properties.ng_assist_mode||"assist";
    const provider=connectedProvider(node);
    // Manual never starts a scene proposal; only Auto does, and only with a connected loader.
    auto.disabled=!canAutoDirect(state.mode,provider,state.busy);
    let problem="";if(state.suggestion)try{changes();}catch(error){problem=error.message;}
    const stale=state.suggestion&&state.snapshot!==fingerprint();
    apply.disabled=!state.suggestion||stale||!provider||state.busy||state.mode==="manual"||!!problem;
    cancel.hidden=!state.busy;
    discard.hidden=!state.suggestion;
    for(const button of bar.children)button.setAttribute("aria-pressed",String(button.dataset.mode===state.mode));
    if(!state.busy&&!state.suggestion)status.textContent=state.error||(provider?`AI Assist · ${provider.model||provider.provider}`:"AI off · connect H3 AI Loader to the Connector");
    if(!state.busy&&state.suggestion)status.textContent=stale?"Project or provider changed; request a fresh suggestion.":problem||"Review the selected fields, then Apply.";
    state.sync=sync;
  }
  auto.onclick=async()=>{
    const provider=connectedProvider(node);if(!provider||!canAutoDirect(state.mode,provider))return;
    clear();state.busy=true;state.error="";state.snapshot=fingerprint();state.controller=new AbortController();
    const serial=++state.serial,controller=state.controller;sync();
    status.textContent="Planning scene suggestion…";
    try{const data=await aiAction(app,api,"direct",{...readPayload(node),provider,mode:state.mode},controller.signal);
      if(state.removed||controller.signal.aborted||serial!==state.serial)return;
      state.suggestion=data.suggestion;review();persist();
    }catch(failure){if(!state.removed&&serial===state.serial){clear();state.error=failure.message;}}
    finally{if(!state.removed&&serial===state.serial){state.busy=false;state.controller=null;sync();}}
  };
  apply.onclick=()=>{
    sync();if(apply.disabled)return;
    try{const result=changes();delete result.skipped;clear();applyValues(node,result);node.graph?.change();state.error="Applied selected fields · manual editing remains available.";sync();}
    catch(error){status.textContent=error.message;}
  };
  cancel.onclick=()=>{state.serial++;state.controller?.abort();state.controller=null;state.busy=false;clear();state.error="AI cancelled · active Shots unchanged.";sync();};
  discard.onclick=()=>{clear();state.error="Suggestion discarded · active Shots unchanged.";node.graph?.change();sync();};
  function restore(){
    const pending=node.properties.ng_direction_draft;
    state.suggestion=pending?.schema_version===1?pending.suggestion:null;state.snapshot=pending?.snapshot||"";state.selected=pending?.selected||[];
    try{review(true);}catch(error){clear();state.error=error.message;}sync();
  }
  restore();return {root,sync,restore,dispose(){state.removed=true;state.serial++;state.controller?.abort();}};
}
