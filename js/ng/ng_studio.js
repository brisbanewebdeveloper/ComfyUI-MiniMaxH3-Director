import { element, values, applyValues, request } from "./ng_widgets.js";
import { readPayload, readContexts,connectedProvider } from "./ng_read.js";
import { control, hideNative, section } from "./ng_editor_fields.js";
import { storyEditor } from "./ng_story_editor.js";
import { ensureStudioStyle } from "./ng_studio_style.js";
import { attachProgress } from "./ng_studio_progress.js";
import { mediaURL } from "./ng_media_editor.js";
import { directionTools } from "./ng_direction.js";
import { projectRenderIds,hasRenderPath } from "./ng_graph.js";
import { renameReferences,renderReferences } from "./ng_references.js";
import {relationNames} from "./ng_asset_relations.js";
import { contextColor } from "./ng_identity.js";
import { inspector,warningView } from "./ng_inspector.js";
import { summarizeBatch } from "./ng_assist.js";
import { renameStoryReferences } from "./ng_story_model.js";
import {frameSeconds} from "./ng_timeline.js";

const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;
const studios = new Set();
const ICONS = { image:"🖼", video:"🎬", audio:"🔊", text:"T" };
const RATIOS = { "16:9":[1024,576], "9:16":[576,1024], "3:2":[1152,768], "2:3":[768,1152], "1:1":[768,768] };

function attach(node) {
  ensureStudioStyle(); node.properties ||= {};
  delete node.properties.ng_view_mode;
  node.color = "#172a48"; node.bgcolor = "#101a2c";
  const root = element("div", "ng-studio");
  const header = element("div", "ng-header"), status = element("span", "ng-ai-badge", "AI off · manual");
  header.append(element("strong", "", "🎬 H3 DIRECTOR"), status);
  const create = section("☀ Idea / Prompt"), idea = control(node,"idea","Describe your video",{multiline:true});
  idea.field.placeholder = "A woman enters an abandoned space station…"; create.append(idea.label);
  const referencePreview=element("div","ng-text-highlight");create.append(referencePreview);
  const row = element("div", "ng-row"), duration = control(node,"project_seconds","Project · seconds",{number:true,step:"0.5"});
  const ratioLabel = element("label", "ng-field"); ratioLabel.append(element("span","ng-field-label","Aspect ratio"));
  const ratio = element("select"); ratio.setAttribute("aria-label","Aspect ratio");
  for (const name of [...Object.keys(RATIOS), "Custom"]) { const option=element("option","",name);option.value=name;ratio.append(option); }
  ratio.onchange = () => { if (RATIOS[ratio.value]) { const [width,height]=RATIOS[ratio.value]; applyValues(node,{width,height}); node.graph?.change(); } };
  const chunk=control(node,"chunk_seconds","Chunk Length · 0 = Auto",{number:true,step:"0.5"});
  const settings=section("⚙ Project Settings"), fps=element("div","ng-field");fps.append(element("span","ng-field-label","FPS"),element("span","ng-generation-card","24 · H3 native"));
  const style=control(node,"style","Style");ratioLabel.append(ratio);row.append(duration.label,chunk.label,ratioLabel,fps);
  if(node.widgets.some((widget)=>widget.name==="style"))row.append(style.label);settings.append(row);
  const resolution=element("div","ng-row"),width=control(node,"width","Width",{number:true}),height=control(node,"height","Height",{number:true});
  resolution.append(width.label,height.label);settings.append(resolution);
  const context = section("Context"), contextList=element("div","ng-context-list");
  const batch=element("div","ng-tools"),batchButton=element("button","ng-secondary","✨ Analyze all contexts"),batchCancel=element("button","","Cancel AI");
  const batchStatus=element("small","ng-muted");batch.append(batchButton,batchCancel,batchStatus);
  context.append(batch,contextList);
  const story=storyEditor(node);
  const direction=directionTools(node,api);create.append(direction.root);
  const audio=element("details","ng-audio-details");audio.append(element("summary","","♫ Audio · Voice / Music / SFX"));const audioTracks=element("div");audio.append(audioTracks);
  const generation=section("Generation"), summary=element("div","ng-plan-summary","Planning…"), warnings=element("div");
  const generationCards=element("div","ng-generation-cards"),renderStatus=element("span","ng-status","Checking plan…");
  const preview=element("img","ng-live-preview");preview.alt="Live H3 sampling preview";preview.hidden=true;
  const sampling=element("div","ng-row ng-sampling-settings");
  const fields=[idea,duration,chunk,style,width,height];
  for(const [name,label] of [["seed","Seed"],["steps","Steps"],["sampler_name","Sampler"],["scheduler","Scheduler"]]){
    const field=control(node,name,label,{number:["seed","steps"].includes(name)});fields.push(field);sampling.append(field.label);
  }
  generation.append(sampling,generationCards,summary,renderStatus,preview,warnings);
  const progress=attachProgress(node,api,renderStatus,preview,()=>projectRenderIds(node));
  const advanced=element("details","ng-generation-details");advanced.append(element("summary","","Continuity, sound and model settings"));
  for (const [name,label] of [["mode","H3 mode"],["continuity","Continuity"],["pin_frames","Pinned frames"],
                            ["soundscape","Soundscape"],["music","Music"],["shift_video","Video shift"],["shift_audio","Audio shift"]]) {
    const field=control(node,name,label,{number:["shift_video","shift_audio"].includes(name)});
    fields.push(field);advanced.append(field.label);
  }
  const outputInspector=inspector(node);
  const actions=element("div","ng-actions"), generate=element("button","ng-button","Generate video");
  const hint=element("span","ng-muted","Context Connector → Director → Director Output → Render Sequence → Save Video");
  generate.onclick=()=>app.queuePrompt(0,1);generation.append(generate);actions.append(hint);
  const creation=element("div","ng-creation-grid");creation.append(create,settings);
  root.append(header,creation,context,story.root,generation,outputInspector.root,audio,advanced,actions);
  hideNative(node,(node.widgets || []).map((widget)=>widget.name));
  const dom=node.addDOMWidget("ng_studio","ng_studio",root,{serialize:false,hideOnZoom:false});
  dom.computeSize=undefined;
  dom.computeLayoutSize=()=>({minHeight:760,maxHeight:Number.MAX_SAFE_INTEGER,minWidth:0});
  let timer=null, serial=0, removed=false;
  async function runBatch() {
    const provider=connectedProvider(node);
    if(!provider||batchBusy)return;
    batchBusy=true;batchController=new AbortController();syncBatch();
    batchStatus.textContent="Analyzing every context…";
    try{
      const data=await request(api,"/ng/analyze_all",{provider,mode:node.properties.ng_assist_mode||"assist",contexts:readContexts(node)},batchController.signal);
      const sum=summarizeBatch(data);
      // The cards themselves are not touched here: the user reviews each suggestion on its own card and applies
      // the fields they want, so a batch run can never overwrite a card behind the user's back.
      batchStatus.textContent=[sum.part,...sum.failed,...sum.skipped].join(" · ")||"Nothing analyzed";
    }catch(error){batchStatus.textContent=error.message;}
    finally{batchBusy=false;batchController=null;syncBatch();}
  }
  let batchBusy=false, batchController=null;
  function syncBatch() {
    const provider=connectedProvider(node);
    batchButton.disabled=batchBusy||!provider||(node.properties.ng_assist_mode||"assist")==="manual";
    batchCancel.hidden=!batchBusy;
    if(!batchBusy&&!batchStatus.textContent)batchStatus.textContent=provider?"Each card still needs its own Apply.":"Connect H3 AI Loader to the Connector.";
  }
  function batchSettings(){
    // Manual never sends an analysis, so the batch button is disabled there instead of explaining a refusal.
    batchButton.title=(node.properties.ng_assist_mode||"assist")==="manual"?"Manual mode sends no analysis. Choose Assist or Auto.":"Analyzes every context; each card still needs its own Apply.";
    syncBatch();
  }
  batchButton.onclick=()=>runBatch();
  batchCancel.onclick=()=>batchController?.abort();
  function contexts() {
    contextList.replaceChildren();
    const entries=readContexts(node);story.contexts(entries,api);direction.sync();audioTracks.replaceChildren();
    const previous=node.properties.ng_context_names||{},now=values(node),renamed={};
    for(const key of ["idea","shots"]){const rename=key==="shots"?renameStoryReferences:renameReferences;
      const text=rename(now[key]||"",previous,entries);if(text!==now[key])renamed[key]=text;}
    node.properties.ng_context_names=Object.fromEntries(entries.filter((entry)=>entry.widgets.context_id&&entry.widgets.name).map((entry)=>[entry.widgets.context_id,entry.widgets.name]));
    if(Object.keys(renamed).length)applyValues(node,renamed);
    renderReferences(referencePreview,values(node).idea||"",entries,element);
    status.textContent=connectedProvider(node)?`AI Assist · available`: "AI off · manual";
    batchSettings();
    generate.disabled=!hasRenderPath(node);
    hint.textContent=generate.disabled?"Connect Director Output to a Render Sequence or native sampler, then a video output.":"Context Connector → Director → Director Output → Render Sequence → Save Video";
    if (!entries.length) contextList.append(element("span","ng-muted","Optional · connect an Image, Video, Audio or Text context."));
    for (const entry of entries) {
      const chip=element("div","ng-context-chip",`${ICONS[entry.media]} ${entry.widgets.name || entry.media}`);
      chip.style.setProperty("--context-color",contextColor(entry));
      chip.append(element("small","",entry.widgets.usage?.replaceAll("_"," ")||""));
      const owners=relationNames(entry,entries);if(owners)chip.append(element("small","","→ "+owners));
      if(entry.media==="image"||entry.media==="video"){const preview=element(entry.media==="image"?"img":"video");preview.src=mediaURL(entry.widgets[entry.media],api);if(entry.media==="image")preview.alt=entry.widgets.name||"Context";else preview.preload="metadata";chip.append(preview);}
      if(entry.media==="audio"){const player=element("audio");player.controls=true;player.src=mediaURL(entry.widgets.audio,api);player.preload="metadata";
        const track=element("div","ng-audio-track"),lane=element("div","ng-audio-lane"),bar=element("span","ng-audio-region",entry.widgets.usage);
        bar.style.background=contextColor(entry);let options={};try{options=JSON.parse(entry.widgets.context_options||"{}");}catch{}
        const seconds=Number(values(node).project_seconds),length=options.end_s?options.end_s-(options.start_s||0):seconds;
        const timed=["copy","lock"].includes(entry.widgets.usage);bar.style.width=`${timed?Math.min(100,length/seconds*100):100}%`;
        bar.title=timed?`Source selection placed from 0 to ${Math.min(seconds,length).toFixed(2)} s`:"Reference for the whole project; not a copied soundtrack.";
        lane.append(bar);track.append(element("span","",`${entry.widgets.name||"Audio"} · ${entry.widgets.usage}`),lane,player);audioTracks.append(track);
        chip.append(element("span","ng-muted","♫ "+(entry.widgets.speaker||"Audio")));}
      chip.title=entry.widgets.usage || "";contextList.append(chip);
    }
  }
  async function refresh() {
    const current=++serial; contexts();
    const now=values(node);ratio.value=Object.keys(RATIOS).find((name)=>RATIOS[name][0]===now.width&&RATIOS[name][1]===now.height)||"Custom";
    try {
      const data=await request(api,"/ng/plan",readPayload(node));
      if (removed || current!==serial) return;
      summary.textContent=`${frameSeconds(data.total_frames,data.fps)} s delivered · ${now.project_seconds} s requested · ${data.chunks.length} render chunk${data.chunks.length===1?"":"s"} · ${now.continuity.replaceAll("_"," + ")}`;
      generationCards.replaceChildren();
      for(const [title,detail]of[[`${data.chunks.length} Chunks`,data.chunks.map((chunk)=>`${chunk.index+1}: ${frameSeconds(chunk.delivered_frames,data.fps)} s`).join(" · ")],
                               ["Continuity",now.continuity.replaceAll("_"," + ")],["Total Duration",`${frameSeconds(data.total_frames,data.fps)} s · ${data.total_frames} frames`],
                               [generate.disabled?"Connect render path":"Ready",data.mode.toUpperCase()]]){
        const card=element("div","ng-generation-card");card.append(element("strong","",title),element("small","",detail));generationCards.append(card);}
      warnings.replaceChildren();data.issues.forEach((issue)=>warnings.append(warningView(issue,readContexts(node))));
      outputInspector.render(data,readContexts(node));
      story.plan(data);progress.planning("Ready · plan checked");
    } catch (error) { if (current===serial&&!removed) { summary.textContent=error.message; progress.planning("Check project"); generationCards.replaceChildren();outputInspector.render(null,[]); story.plan(null);generate.disabled=true; } }
  }
  function schedule() { clearTimeout(timer); serial++;story.invalidate();timer=setTimeout(refresh,300); }
  for (const widget of node.widgets || []) {
    if (widget===dom) continue;
    const original=widget.callback;widget.callback=function(...args){const result=original?.apply(this,args);schedule();return result;};
  }
  const connected=node.onConnectionsChange;
  node.onConnectionsChange=function(...args){const result=connected?.apply(this,args);schedule();return result;};
  const configured=node.onConfigure;
  node.onConfigure=function(...args){const result=configured?.apply(this,args);delete node.properties.ng_view_mode;fields.forEach((field)=>field.sync());story.rebuild();direction.sync();schedule();return result;};
  const originalRemoved=node.onRemoved;
  node.onRemoved=function(...args){removed=true;serial++;clearTimeout(timer);studios.delete(schedule);progress.dispose();direction.dispose();story.dispose();batchController?.abort();return originalRemoved?.apply(this,args);};
  node.setSize([880,980]);studios.add(schedule);schedule();
}

app.registerExtension({name:"mmxd.ng.director_studio",nodeCreated(node){if(["NGH3Director","NGDirectorStudio"].includes(node.comfyClass))attach(node);},loadedGraphNode(){studios.forEach((schedule)=>schedule());}});
document.addEventListener("ng-context-changed",()=>studios.forEach((schedule)=>schedule()));
