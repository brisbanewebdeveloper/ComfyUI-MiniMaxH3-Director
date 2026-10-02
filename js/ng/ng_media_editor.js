import { element, values, request } from "./ng_widgets.js";
import { section } from "./ng_editor_fields.js";
import { contextOptions, setOptions, optionNumber } from "./ng_context_controls.js";

export function mediaURL(source, api) {
  const path=String(source||"").replace(/ \[input\]$/,"" ).replaceAll("\\","/");
  const split=path.lastIndexOf("/");
  return api.apiURL("/view?"+new URLSearchParams({filename:path.slice(split+1),subfolder:split<0?"":path.slice(0,split),type:"input"}));
}

export function mediaEditor(node, media, api) {
  const root=element("div","ng-media-editor"), status=element("div","ng-muted");
  let source="", serial=0, disposed=false, player=null, envelope=null;
  const controls=[], selection=element("div","ng-wave-selection");
  const waveform=element("div","ng-wave-container"), track=element("div","ng-wave-track"), canvas=element("canvas","ng-waveform");canvas.width=640;canvas.height=100;
  const metadata=element("div","ng-muted"),settings=section("Preview Settings"),ruler=element("div","ng-wave-ruler");
  function draw() {
    if(!envelope)return;
    const ctx=canvas.getContext("2d");ctx.clearRect(0,0,640,100);ctx.fillStyle="#9974ff";
    envelope.peaks.forEach((peak,index)=>ctx.fillRect(index/envelope.peaks.length*640,50-peak*48,Math.max(1,640/envelope.peaks.length-1),Math.max(1,peak*96)));
    const options=contextOptions(node), end=options.end_s||envelope.duration_s;
    selection.style.left=`${options.start_s/envelope.duration_s*100}%`;
    selection.style.width=`${Math.max(0,end-options.start_s)/envelope.duration_s*100}%`;
  }
  function sync() {controls.forEach((field)=>field.sync());draw();}
  function audioControls() {
    track.append(canvas,selection);waveform.append(track);root.append(waveform,ruler);
    const row=element("div","ng-row"), start=optionNumber(node,"start_s","Start · seconds"), end=optionNumber(node,"end_s","End · 0 = file end");
    controls.push(start,end);row.append(start.root,end.root);settings.append(row);
    for(const part of ["start_s","end_s"]) {
      const handle=element("span","ng-wave-handle "+(part==="start_s"?"ng-time-start":"ng-time-end"));selection.append(handle);
      handle.onpointerdown=(event)=>{
        if(!envelope)return;event.preventDefault();event.stopPropagation();handle.setPointerCapture(event.pointerId);
        let candidate=contextOptions(node)[part];
        handle.onpointermove=(move)=>{
          const rect=track.getBoundingClientRect(), seconds=Math.max(0,Math.min(envelope.duration_s,(move.clientX-rect.left)/rect.width*envelope.duration_s));
          const current=contextOptions(node), end=current.end_s||envelope.duration_s;
          candidate=part==="start_s"?Math.min(seconds,end-0.05):Math.max(seconds,current.start_s+0.05);
          if(part==="start_s")selection.style.left=`${candidate/envelope.duration_s*100}%`;
          selection.style.width=`${((part==="end_s"?candidate:end)-(part==="start_s"?candidate:current.start_s))/envelope.duration_s*100}%`;
        };
        handle.onpointerup=()=>{handle.onpointermove=null;setOptions(node,{[part]:Math.round(candidate*100)/100});sync();};
        handle.onpointercancel=()=>{handle.onpointermove=null;sync();};
      };
    }
    node.properties.ng_preview_settings ||= {volume:1,fade_in:0,fade_out:0,zoom:1};
    for(const [key,label,max] of [["volume","Volume",1],["fade_in","Fade In",5],["fade_out","Fade Out",5],["zoom","Waveform Zoom",4]]) {
      const line=element("label","ng-field"), input=element("input");input.type="range";input.min=key==="zoom"?"1":"0";input.max=String(max);input.step="0.05";
      input.value=node.properties.ng_preview_settings[key];input.setAttribute("aria-label",label);
      const number=element("span","ng-muted",input.value);line.append(element("span","",label),input,number);settings.append(line);
      input.oninput=()=>{node.properties.ng_preview_settings[key]=Number(input.value);number.textContent=input.value;
        if(key==="zoom"){track.style.width=`${Number(input.value)*100}%`;}
        node.graph?.change();};
    }
    track.style.width=`${node.properties.ng_preview_settings.zoom*100}%`;
    settings.append(element("small","ng-muted","Volume/fades affect playback only. Start/end select the source used by generation."));
  }
  async function refresh() {
    const current=values(node)[media]||"";sync();if(source===current)return;
    source=current;const version=++serial;player?.pause();root.querySelector(".ng-source-preview")?.remove();
    envelope=null;status.textContent="";if(!source){status.textContent="Choose or upload a source.";return;}
    const view=element(media==="image"?"img":media,"ng-source-preview");view.src=mediaURL(source,api);
    if(media==="image") {
      view.alt=values(node).name||"Image preview";
      view.onclick=()=>{const dialog=element("dialog","ng-image-dialog"),image=element("img");image.src=view.src;image.alt=view.alt;
        dialog.append(image);dialog.onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();};
    } else {view.controls=true;view.preload="metadata";player=view;}
    root.prepend(view);
    if(media==="audio") {
      view.onplay=()=>{const options=contextOptions(node);if(view.currentTime<options.start_s||view.currentTime>=(options.end_s||view.duration))view.currentTime=options.start_s;};
      view.ontimeupdate=()=>{const options=contextOptions(node), settings=node.properties.ng_preview_settings, end=options.end_s||view.duration;
        if(view.currentTime>=end){view.pause();view.currentTime=options.start_s;}
        const fadeIn=settings.fade_in?Math.min(1,Math.max(0,(view.currentTime-options.start_s)/settings.fade_in)):1;
        const fadeOut=settings.fade_out?Math.min(1,Math.max(0,(end-view.currentTime)/settings.fade_out)):1;
        view.volume=settings.volume*Math.min(fadeIn,fadeOut);};
      try {
        const data=await request(api,"/ng/waveform?"+new URLSearchParams({source}));
        if(disposed||version!==serial)return;envelope=data;
        metadata.textContent=`${data.duration_s.toFixed(2)} s · ${(data.sample_rate/1000).toFixed(1)} kHz · ${data.channels===2?"Stereo":data.channels+" channel(s)"}`;draw();
        ruler.replaceChildren();for(let tick=0;tick<=4;tick++)ruler.append(element("span","",`${(data.duration_s*tick/4).toFixed(1)} s`));
      } catch(error){if(version===serial)status.textContent=error.message;}
    }
  }
  if(media==="audio")audioControls();
  if(media==="video") {
    const row=element("div","ng-row");for(const [key,label] of [["start_s","Source start · seconds"],["end_s","Source end · 0 = file end"]]){
      const field=optionNumber(node,key,label);controls.push(field);row.append(field.root);}root.append(row);
  }
  root.append(status);
  return {root,settings,metadata,refresh,sync,dispose(){disposed=true;serial++;player?.pause();}};
}
