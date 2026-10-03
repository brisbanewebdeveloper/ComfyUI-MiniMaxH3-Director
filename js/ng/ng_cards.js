import { ensureStudioStyle } from "./ng_studio_style.js";
import { control, hideNative, section } from "./ng_editor_fields.js";
import { values, applyValues, element, newContextId,analysisFingerprint } from "./ng_widgets.js";
import { attachAnalysis } from "./ng_analysis.js";
import { FAMILY } from "./ng_context.js";
import { rolePanel, preservePanel, optionNumber, contextOptions, setOptions, selectedRoles } from "./ng_context_controls.js";
import { mediaEditor } from "./ng_media_editor.js";
import { textEditor } from "./ng_context_text.js";
import { presetEditor } from "./ng_context_presets.js";
import { autoColor } from "./ng_identity.js";
import { relatedContexts } from "./ng_read.js";
import { subjectChoices, voiceAssignment } from "./ng_subjects.js";
import {assetPanel,restoreAssetWidget} from "./ng_asset_relations.js";

const { app }=window.comfyAPI.app, { api }=window.comfyAPI.api;
const MEDIA={NGContextImage:"image",NGContextVideo:"video",NGContextAudio:"audio",NGContextText:"text"};
const ICONS={image:"▧",video:"▣",audio:"♫",text:"T"};

function attach(node,media) {
  ensureStudioStyle();node.properties||={};
  const identity=node.widgets?.find((widget)=>widget.name==="context_id");if(identity&&!identity.value)identity.value=newContextId();
  const colorWidget=node.widgets?.find((widget)=>widget.name==="color");
  function assignColor(){if(colorWidget&&!colorWidget.value){
    const used=(node.graph?._nodes||[]).filter((other)=>other!==node).map((other)=>values(other).color);
    colorWidget.value=autoColor(media,identity?.value,used);}}
  assignColor();
  const root=element("div","ng-studio-context"), header=element("div","ng-header"), titles=element("div");
  root.dataset.media=media;
  const title=element("strong","ng-context-title",`${ICONS[media]} H3 CONTEXT ${media.toUpperCase()}`), nameText=element("div","ng-context-name");
  const analyzed=element("span","ng-ai-badge"), toggle=element("button","","Details");titles.append(title,nameText);header.append(titles,analyzed,toggle);
  const caption=element("div","ng-context-caption"), details=element("div","ng-context-details"), status=element("div","ng-status");
  const fields=[], components=[], top=element("div","ng-context-top"), lower=element("div","ng-context-bottom");
  const source=section(media==="audio"?"♫ Audio Track":"Source"), file=media==="text"?null:control(node,media,"Input file");
  if(file){fields.push(file);source.append(file.label);const upload=element("button","","Browse / Upload");
    upload.onclick=()=>{const widget=node.widgets.find((entry)=>entry.name==="upload"||entry.name==="choose file to upload");
      if(widget)widget.callback?.();else status.textContent="Use ComfyUI's file upload action.";};source.append(upload);}
  const name=control(node,"name","Name"), description=control(node,"description","Description",{multiline:true});fields.push(name,description);
  const content=rolePanel(node,media,"content"), usage=rolePanel(node,media,"usage");components.push(content,usage);
  let preview=null,editor=null;
  const analysisPanel=section("✨ Preview / Analysis"),footer=element("div","ng-context-footer");
  const relations=assetPanel(node);if(relations){components.push(relations);footer.append(relations.root);}
  if(media==="text") {editor=textEditor(node);components.push(editor);editor.sidebar.append(usage.root,analysisPanel);top.append(editor.root);}
  else {preview=mediaEditor(node,media,api);source.append(preview.metadata);
    content.root.append(analysisPanel);
    if(media==="audio"){top.append(preview.root);lower.append(content.root,usage.root,preview.settings);}
    else {top.append(preview.root,content.root);lower.append(usage.root);}}
  if(media==="image") {
    const preserve=preservePanel(node);components.push(preserve);lower.append(preserve.root);
    const anchor=optionNumber(node,"anchor_s","Keyframe / storyboard scene time · seconds",-1);components.push(anchor);usage.root.append(anchor.root);
  }
  if(media==="video") {
    const audio=section("♫ Audio Track"), select=element("select");select.setAttribute("aria-label","Video Audio Track");
    for(const [value,label] of [["ignore","Ignore"],["reference","Use as paired audio reference"]]){const option=element("option","",label);option.value=value;select.append(option);}
    select.onchange=()=>setOptions(node,{video_audio:select.value});audio.append(select);
    const preserve=control(node,"preserve","Preserve");fields.push(preserve);audio.append(preserve.label);lower.append(audio);
    components.push({sync(){select.value=contextOptions(node).video_audio;}});
    audio.append(element("small","ng-muted","Continue uses the last source frame as a start guide. Structure and camera are reference/prompt guidance."));
  }
  if(media==="audio") {const speaker=control(node,"speaker","Speaker / Voice"),speakerPanel=section("Speaker / Voice");fields.push(speaker);speakerPanel.append(speaker.label);
    const choices=element("select");choices.setAttribute("aria-label","Assign known speaker");speakerPanel.append(choices);
    const note=element("small","ng-muted");speakerPanel.append(note);
    choices.onchange=()=>{if(choices.value)applyValues(node,{speaker:choices.value});};
    // Only figures (character/face/animal images with a file) can be spoken for, and a stored speaker that is no
    // longer connected stays listed, so choosing someone else never silently drops the old value.
    components.push({sync(){const entries=relatedContexts(node),current=speaker.field.value;
      choices.replaceChildren();const empty=element("option","","Choose a connected character");empty.value="";choices.append(empty);
      for(const entry of subjectChoices(entries,current)) {const option=element("option","",entry.name);option.value=entry.id;choices.append(option);}
      choices.value=current;
      const flag=voiceAssignment(entries)(current,node.widgets?.find((widget)=>widget.name==="context_id")?.value);
      note.textContent=flag;note.hidden=!flag;}});footer.append(speakerPanel);}
  const presets=presetEditor(node,media,api,status), colorPanel=section("◉ Context Color"), color=control(node,"color","Auto / Custom · #rrggbb");
  fields.push(color);const auto=element("button","","Auto"), custom=element("input");custom.type="color";custom.setAttribute("aria-label","Custom context color");
  auto.onclick=()=>{applyValues(node,{color:""});assignColor();update();};custom.oninput=()=>applyValues(node,{color:custom.value});colorPanel.append(color.label,auto,custom);
  const advanced=element("details");advanced.append(element("summary","","Description / Identity"),description.label);
  const id=control(node,"context_id","Context ID");fields.push(id);advanced.append(id.label,colorPanel);
  if(media==="text"){advanced.append(content.root);editor.sidebar.append(presets.root);if(relations)editor.sidebar.append(relations.root);details.append(name.label,top,advanced,status);}
  else {footer.append(source,presets.root);details.append(name.label,top,lower,footer,advanced,status);}
  const analysis=attachAnalysis(node,media,analysisPanel,status);
  root.append(header,caption,details);
  function expand(value) {
    root.dataset.expanded=String(value);
    node.properties.ng_context_expanded=value;details.hidden=!value;caption.hidden=value;toggle.textContent=value?"Compact":"Details";
    const sizes={image:[820,790],video:[820,760],audio:[1120,880],text:[1280,860]};
    node.setSize(value?sizes[media]:[380,210]);node.setDirtyCanvas?.(true,true);
  }
  toggle.onclick=()=>{expand(!node.properties.ng_context_expanded);node.graph?.change();};
  hideNative(node,(node.widgets||[]).map((widget)=>widget.name));
  const dom=node.addDOMWidget("ng_context_card","ng_context_card",root,{serialize:false,hideOnZoom:false});
  // Native uploads add their preview later. Hide those per-node widgets as they arrive, while keeping source callbacks.
  for(const method of ["addWidget","addCustomWidget"]){const original=node[method];if(!original)continue;
    node[method]=function(...args){const result=original.apply(this,args);
      hideNative(node,(node.widgets||[]).filter((widget)=>widget!==dom).map((widget)=>widget.name));return result;};}
  dom.computeSize=undefined;
  dom.computeLayoutSize=()=>({minHeight:node.properties.ng_context_expanded?630:125,maxHeight:Number.MAX_SAFE_INTEGER,minWidth:0});
  let timer=null,removed=false;
  function update() {
    if(removed)return;
    try {
    const now=values(node);node.color="#192842";node.bgcolor="#101a2c";
    // Upload previews can be added asynchronously after nodeCreated; the media workspace already owns the preview.
    hideNative(node,(node.widgets||[]).filter((widget)=>widget!==dom).map((widget)=>widget.name));
    const accent=/^#[0-9a-f]{6}$/i.test(now.color)?now.color:FAMILY[node.comfyClass].color;root.style.setProperty("--ng-accent",accent);custom.value=accent;
    nameText.textContent=now.name||"New "+media+" context";
    caption.textContent=`${selectedRoles(node,"content").join(" + ")||media} · ${selectedRoles(node,"usage").join(" + ")} · Preserve ${now.preserve}`;
    const analyzedCurrent=node.properties.ng_analysis?.fingerprint===analysisFingerprint(media,now);analyzed.textContent=analyzedCurrent?"✨ Analyzed":"Manual";
    fields.forEach((field)=>field.sync());components.forEach((component)=>component.sync());analysis.sync();preview?.refresh();
    }catch(error){status.textContent=`Check context settings: ${error.message}`;caption.textContent=status.textContent;analyzed.textContent="Check settings";}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(update,80);}
  for(const widget of node.widgets||[]){if(widget===dom)continue;const previous=widget.callback;
    widget.callback=function(...args){const result=previous?.apply(this,args);schedule();document.dispatchEvent(new CustomEvent("ng-context-changed"));return result;};}
  const configured=node.onConfigure;node.onConfigure=function(...args){const result=configured?.apply(this,args);
    restoreAssetWidget(node);
    // Old workflows end after ID/colour; browser upload widgets must not fill newly added JSON fields.
    const saved=args[0]?.widgets_values;
    if(Array.isArray(saved)&&saved.length<=(media==="audio"?9:8))
      for(const widget of node.widgets||[])if(["content_roles","usage_roles","context_options"].includes(widget.name))widget.value="";
    if(identity&&!identity.value)identity.value=newContextId();assignColor();presets.sync();expand(!!node.properties.ng_context_expanded);schedule();return result;};
  const connected=node.onConnectionsChange;node.onConnectionsChange=function(...args){const result=connected?.apply(this,args);schedule();return result;};
  const oldRemoved=node.onRemoved;node.onRemoved=function(...args){removed=true;clearTimeout(timer);preview?.dispose();analysis.dispose();return oldRemoved?.apply(this,args);};
  const changed=()=>schedule();document.addEventListener("ng-context-changed",changed);
  const cleanup=node.onRemoved;node.onRemoved=function(...args){document.removeEventListener("ng-context-changed",changed);return cleanup?.apply(this,args);};
  expand(!!node.properties.ng_context_expanded);update();
}

app.registerExtension({name:"mmxd.ng.context_cards",nodeCreated(node){if(MEDIA[node.comfyClass])attach(node,MEDIA[node.comfyClass]);}});
