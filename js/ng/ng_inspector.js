import { element,values,applyValues } from "./ng_widgets.js";
import { control } from "./ng_editor_fields.js";
import { renderCompiled } from "./ng_references.js";
import { contextColor } from "./ng_identity.js";

export function inspector(node) {
  const root=element("details","ng-expert"),summary=element("summary","","Output Inspector"),tools=element("div","ng-tools");
  const view=element("select"),prompts=element("div"),raw=element("details"),rawText=element("pre"),budget=element("div","ng-muted");
  view.setAttribute("aria-label","Prompt highlighting");for(const [value,label] of [["context","Context Colors"],["plain","Plain Text"],["syntax","H3 Syntax"]]){
    const option=element("option","",label);option.value=value;view.append(option);}
  view.value=node.properties.ng_prompt_view||"context";
  const override=control(node,"prompt_override","Manual H3 prompt override · every chunk",{multiline:true});
  const overrideState=element("span","ng-ai-badge"),rebuild=element("button","","Rebuild from Director");
  const why=element("div","ng-muted");
  tools.append(view,overrideState,rebuild);raw.append(element("summary","","Director Context · raw"),rawText);
  root.append(summary,budget,why,tools,prompts,override.label,raw);
  let data=null,entries=[];
  function sync(){
    override.sync();const active=!!values(node).prompt_override?.trim();overrideState.textContent=active?"Manual Override Active":"Compiled from Director";rebuild.disabled=!active;
    prompts.replaceChildren();if(!data)return;
    for(const chunk of data.chunks){const text=element("pre");renderCompiled(text,chunk,entries,view.value,element);prompts.append(element("h4","",`Chunk ${chunk.index+1}`),text);}
    rawText.textContent=JSON.stringify(data.director_context,null,2);
    const counts={image:0,video:0,audio:0};let total=0;
    for(const chunk of data.chunks){const ids={image:new Set(),video:new Set(),audio:new Set()};
      const pictures=new Set(chunk.refs.filter(ref=>ref.kind==="picture").map(ref=>ref.ctx_id));
      // A shared image is presented once per Subject and consumes a slot for each Picture.
      for(const [index,ref] of chunk.refs.entries()){
        if(["first_frame","last_frame"].includes(ref.kind)&&pictures.has(ref.ctx_id))continue;
        const media={picture:"image",first_frame:"image",last_frame:"image",video:"video",audio:"audio"}[ref.kind];
        if(media)ids[media].add(ref.kind==="picture"?`${index}:${ref.ctx_id}`:`${ref.kind}:${ref.ctx_id}`);}
      for(const media of Object.keys(counts))counts[media]=Math.max(counts[media],ids[media].size);
      total=Math.max(total,ids.image.size+ids.video.size+ids.audio.size);}
    budget.textContent=`Context budget per chunk · Images ${counts.image}/9 · Video ${counts.video}/3 · Audio ${counts.audio}/3 · Total up to ${total}/12`;
    const reason={ref2va:"Active image, motion or audio references use Ref2VA.",fl2va:"Frame guides use FL2VA.",t2va:"No active media references or frame guides; the text determines the scene."}[data.mode]||"Selected by the compiler.";
    why.textContent=`Why ${data.mode.toUpperCase()}? ${reason} Source: ${values(node).mode==="auto"?"automatic mode selection":"your explicit mode"}.`;
  }
  view.onchange=()=>{node.properties.ng_prompt_view=view.value;node.graph?.change();sync();};
  rebuild.onclick=()=>{applyValues(node,{prompt_override:""});node.graph?.change();sync();};
  return {root,render(next,nextEntries){data=next;entries=nextEntries;sync();}};
}

export function warningView(issue,entries) {
  const root=element("div","ng-warning",`${issue.ref?issue.ref+": ":""}${issue.text}`),entry=entries.find((entry)=>[entry.widgets.name,entry.widgets.context_id].includes(issue.ref));
  if(entry){root.style.borderLeft=`3px solid ${contextColor(entry)}`;root.title=entry.widgets.context_id;}
  return root;
}
