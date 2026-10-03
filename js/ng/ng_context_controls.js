import { element, values, applyValues } from "./ng_widgets.js";
import { section } from "./ng_editor_fields.js";

// The H3 prompt is built from three fields, and sound is one of them: overall_soundscape and
// non_diegetic_music are written by the model, so a note has to be able to say what the scene
// should sound like. Audio had no rows here at all, which left the two sound fields unreachable
// from the card that exists to describe the video.
export const CONTENT = {
  image: [["character","Character"],["face","Face / Identity"],["outfit","Outfit"],["pose","Pose"],["environment","Environment"],["style","Style"]],
  video: [["motion","Character Motion"],["camera_motion","Camera Motion"],["environment","Environment"],["shot_rhythm","Shot Rhythm"],["identity","Character Identity"]],
  audio: [["voice","Voice"],["music","Music"],["ambience","Ambience"],["sound_effect","Sound Effect"]],
  text: [["shot","Shot / Action"],["dialogue","Dialogue"],["voice","Voice"],["ambience","Ambience / Soundscape"],["music","Music"],["sound_effect","Sound Effect"],
         ["camera_motion","Camera"],["character","Character"],["outfit","Outfit"],["environment","Environment"],["lighting","Lighting"],["style","Style"],["rules","Constraint"]],
};
export const USAGE = {
  image: [["reference","Reference"],["first_frame","First Frame"],["keyframe","Keyframe"],["last_frame","Last Frame"],["storyboard","Storyboard Frame"]],
  video: [["motion","Motion Reference"],["camera","Camera Reference"],["continue","Continue From Video"],["structure","Whole Structure"]],
  audio: [["voice","Voice Reference"],["copy","Copy Audio"],["lock","Lock Audio"],["music_style","Music Style"],["rhythm","Rhythm Reference"],["sound_reference","Sound Reference"]],
  text: [["style","Style / Direction"],["character","Character Description"],["world","World Lore"],["scene","Scene Description"],["camera","Camera Rule"],["dialogue","Dialogue Rule"],["constraint","Scene Constraint"],["instruction","General Instruction"],["rule","General Rule"]],
};

export function contextOptions(node) {
  const text = values(node).context_options;
  return { schema_version:1, preserve:{}, start_s:0, end_s:0, anchor_s:-1, video_audio:"ignore",
    ...(text ? JSON.parse(text) : {}) };
}
export function setOptions(node, changes) { applyValues(node,{context_options:JSON.stringify({...contextOptions(node),...changes})}); node.graph?.change(); }
export function selectedRoles(node, type) {
  const now=values(node), text=now[type+"_roles"];
  return text ? JSON.parse(text) : now[type] ? [now[type]] : [];
}

export function rolePanel(node, media, type) {
  const root=section(type==="content"?"◎ Detected Content":"◇ Use As"), controls=[];
  const radioGroup=`ng_usage_${crypto.randomUUID()}`;
  for(const [key,label] of (type==="content"?CONTENT:USAGE)[media]) {
    const row=element("label","ng-option-row"), input=element("input");input.type=type==="usage"&&media!=="image"?"radio":"checkbox";
    if(input.type==="radio")input.name=radioGroup;
    input.setAttribute("aria-label",label);row.append(input,element("span","",label));root.append(row);
    input.onchange=()=>{
      const old=selectedRoles(node,type), selected=input.type==="radio"?[key]:input.checked?[...new Set([...old,key])]:old.filter((value)=>value!==key);
      applyValues(node,{[type+"_roles"]:JSON.stringify(selected),[type]:selected[0]||values(node)[type]});node.graph?.change();
    };
    controls.push({key,input});
  }
  return {root,sync(){const roles=selectedRoles(node,type);controls.forEach(({key,input})=>input.checked=roles.includes(key));}};
}

export function preservePanel(node) {
  const root=section("♢ Preserve"), controls=[],expert=element("details");expert.append(element("summary","","Face / Hair / Body / Style / Lighting / Composition"));
  for(const [key,label] of [["identity","Identity"],["outfit","Outfit"],["pose","Pose"],["background","Background"],
    ["face","Face"],["hair","Hair"],["body","Body Shape"],["style","Style"],["lighting","Lighting"],["composition","Composition"]]) {
    const row=element("div","ng-preserve-row"), buttons=element("div","ng-segments");row.append(element("span","",label),buttons);
    for(const value of key==="background"?["ignore","keep","high"]:["low","medium","high"]) {
      const button=element("button","",value[0].toUpperCase()+value.slice(1));button.setAttribute("aria-label",`${label} preserve ${value}`);
      button.onclick=()=>{const options=contextOptions(node);setOptions(node,{preserve:{...options.preserve,[key]:value}});};
      controls.push({key,value,button});buttons.append(button);
    }
    (controls.length<=12?root:expert).append(row);
  }
  root.append(expert);
  root.append(element("small","ng-muted","Retention guides the prompt; the model may still change details."));
  return {root,sync(){const options=contextOptions(node), base=values(node).preserve;
    controls.forEach(({key,value,button})=>button.setAttribute("aria-pressed",String((options.preserve[key]||base)===value)));}};
}

export function optionNumber(node,key,label,min=0) {
  const row=element("label","ng-field"), input=element("input");input.type="number";input.min=String(min);input.step="any";
  input.setAttribute("aria-label",label);row.append(element("span","ng-field-label",label),input);
  input.oninput=input.onchange=()=>{if(input.value!==""&&input.checkValidity())setOptions(node,{[key]:Number(input.value)});};
  return {root:row,input,sync(){if(document.activeElement!==input)input.value=contextOptions(node)[key];}};
}
