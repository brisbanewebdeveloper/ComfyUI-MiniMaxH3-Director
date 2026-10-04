import {element, request} from "./ng_widgets.js";
import {icon} from "./ng_icons.js";
import {contextColor} from "./ng_identity.js";
import {referenceParts} from "./ng_references.js";

const TYPES={image:["Image","image"],video:["Video","film"],text:["Text","file"],voice:["Voice","mic"],
  singing:["Singing","singing"],music:["Music","music"],sound:["Sound effect","sparkle"],ambience:["Ambience","globe"],
  audio:["Audio","audio"],dialogue:["Dialogue","user"],missing:["Disconnected","help"],empty:["Empty shot","clapper"]};
const AUDIO={voice:"voice",dialogue:"voice",singing:"singing",music:"music",sound_effect:"sound",ambience:"ambience"};

function contentKinds(entry) {
  let content=[entry.widgets.content];
  if(entry.widgets.content_roles)try{content=JSON.parse(entry.widgets.content_roles);}catch{content=[];}
  return Array.isArray(content)?[...new Set(content.map(value=>AUDIO[value]).filter(Boolean))]:[];
}

export function shotMedia(shot,entries) {
  const marks=[],seen=new Set(),byId=new Map(entries.map(entry=>[entry.widgets.context_id,entry]));
  function add(entry,identity,role="context") {
    if(seen.has(identity))return;seen.add(identity);
    const kinds=entry?.media==="audio"?contentKinds(entry):[entry?.media||"missing"];
    for(const kind of kinds.length?kinds:["audio"]){
      const label=TYPES[kind][0],name=entry?.widgets.name||identity;
      marks.push({kind,label,entry,contextId:identity,color:entry?contextColor(entry):"#ffc273",
        title:`${label} · ${name} · ${role==="context"?(entry?.widgets.usage||"context settings"):role} · ${identity}`});
    }
  }
  if(shot.text.trim())marks.push({kind:"text",label:"Text",color:"#adb8c5",title:"Action text · written in this shot"});
  for(const binding of shot.media)add(byId.get(binding.context_id),binding.context_id,binding.role);
  for(const part of referenceParts(shot.text,entries))if(part.entry)add(part.entry,part.entry.widgets.context_id);
  for(const spoken of shot.spoken)if(spoken.speaker_id)add(byId.get(spoken.speaker_id),spoken.speaker_id);
  if(shot.spoken.some(line=>line.text.trim()))marks.push({kind:"dialogue",label:"Dialogue",color:"#c5aae6",title:"Original spoken words · written in this shot"});
  return marks.length?marks:[{kind:"empty",label:"Empty shot",color:"#adb8c5",title:"Add action, dialogue or a context"}];
}

export function shotMediaView() {
  const cache=new Map();let disposed=false;
  function load(entry,api) {
    const source=entry.widgets[entry.media],key=JSON.stringify([entry.media,source]);
    if(!cache.has(key)){
      const controller=new AbortController(),asset={controller};
      asset.promise=request(api,"/ng/media?"+new URLSearchParams({media:entry.media,source}),null,controller.signal)
        .then(data=>{if(!data.thumbnail?.startsWith("data:image/"))throw new Error("No input preview was returned.");asset.data=data;return data;})
        .catch(error=>{asset.error=error;throw error;});
      cache.set(key,asset);
    }
    return cache.get(key);
  }
  function preview(entry,api) {
    const figure=element("figure","ng-shot-preview"),image=element("img","ng-shot-thumbnail");image.hidden=true;
    const kind=entry.media==="video"?"First input video frame":"Input image";
    image.alt=`${kind} · ${entry.widgets.name||entry.widgets.context_id}`;
    const caption=element("figcaption","",`${kind} · ${entry.widgets.name||entry.widgets.context_id}`);
    const status=element("span","ng-shot-preview-status","Loading preview…");
    figure.append(image,caption,status);
    if(!entry.widgets[entry.media]){status.textContent="No input file selected.";return figure;}
    if(!api){status.textContent="Preview connection unavailable.";return figure;}
    const asset=load(entry,api);
    const show=data=>{if(disposed||asset.controller.signal.aborted)return;image.src=data.thumbnail;image.hidden=false;status.textContent="";};
    const fail=error=>{if(disposed||asset.controller.signal.aborted)return;status.textContent=`Preview unavailable · ${error.message}`;};
    image.onerror=()=>{image.hidden=true;status.textContent="Preview image could not be displayed.";};
    if(asset.data)show(asset.data);else if(asset.error)fail(asset.error);else asset.promise.then(show,fail);
    return figure;
  }
  function render(shot,entries,api) {
    const root=element("div","ng-shot-media-content"),badges=element("div","ng-shot-media-marks"),gallery=element("div","ng-shot-gallery");
    const marks=shotMedia(shot,entries),visuals=new Map();
    for(const mark of marks){
      const badge=element("span","ng-shot-media-mark");badge.dataset.kind=mark.kind;badge.dataset.contextId=mark.contextId||"";
      badge.style.color=mark.color;badge.title=mark.title;
      badge.append(icon(TYPES[mark.kind][1],"ng-icon ng-shot-media-icon"),element("span","",mark.label));badges.append(badge);
      if(mark.entry&&["image","video"].includes(mark.entry.media))visuals.set(mark.contextId,mark.entry);
    }
    for(const entry of visuals.values())gallery.append(preview(entry,api));
    root.append(badges,gallery);return root;
  }
  function refresh(){for(const asset of cache.values())asset.controller.abort();cache.clear();}
  function prune(entries){
    const used=new Set(entries.filter(entry=>["image","video"].includes(entry.media)).map(entry=>JSON.stringify([entry.media,entry.widgets[entry.media]])));
    for(const [key,asset] of cache)if(!used.has(key)){asset.controller.abort();cache.delete(key);}
  }
  return {render,refresh,prune,dispose(){disposed=true;refresh();}};
}
