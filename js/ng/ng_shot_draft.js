import {readStory, writeStory, LOCK_FIELDS} from "./ng_story_model.js";

export const DRAFT_FORMAT="h3-director-draft";
export function choiceKey(id,field){return JSON.stringify([id,field]);}

export function draftChoices(text,draft){
  const current=readStory(text);if(current.error)throw Error(current.error);
  if(draft?.format!==DRAFT_FORMAT||draft.schema_version!==1||!Array.isArray(draft.patches))throw Error("Unsupported Shot draft.");
  const byId=new Map(current.shots.map(shot=>[shot.id,shot])),seen=new Set(),choices=[];
  for(const patch of draft.patches){
    const shot=byId.get(patch?.shot_id);
    if(!shot||seen.has(shot.id))throw Error("Draft Shot IDs must exist and occur once.");
    seen.add(shot.id);
    if(!patch.fields||Array.isArray(patch.fields)||typeof patch.fields!=="object"||!Object.keys(patch.fields).length)throw Error("Missing Shot draft fields.");
    for(const [field,value] of Object.entries(patch.fields)){
      if(!LOCK_FIELDS.includes(field))throw Error("Unknown Shot draft field.");
      choices.push({key:choiceKey(shot.id,field),shot_id:shot.id,number:current.shots.indexOf(shot)+1,field,value,
        current:field==="timing"?{start:shot.start,end:shot.end}:shot[field],locked:shot.locked_fields.includes(field)});
    }
  }
  for(const field of ["soundscape","music"])if(field in draft){
    if(typeof draft[field]!=="string")throw Error("Invalid project draft field.");
    choices.push({key:choiceKey(null,field),shot_id:null,field,value:draft[field],locked:false});
  }
  return choices;
}

export function displayDraftValue(field,value,contexts){
  const name=id=>contexts.find(entry=>entry.widgets.context_id===id)?.widgets.name||`Disconnected Context: ${id}`;
  if(field==="timing")return `${value.start}–${value.end} s`;
  if(field==="media")return value.length?value.map(binding=>`${name(binding.context_id)} · ${binding.role.replaceAll("_"," ")}`).join("\n"):"No assigned Contexts";
  if(field==="spoken")return value.length?value.map(line=>`${line.speaker_id?name(line.speaker_id):line.voice||"Narrator"} · ${line.language||"English"} · ${line.delivery||"says"}: ${line.text}`).join("\n"):"No spoken lines";
  return value;
}

function spokenValue(line){
  return {schema_version:1,text:line.text||"",speaker_id:line.speaker_id||"",voice:line.voice??"a narrator",
    language:line.language??"English",delivery:line.delivery??"says"};
}
function keepWords(proposed,original){
  const lines=original.split("\n").filter(line=>line.trimStart().startsWith("@")&&line.includes(":"));
  return lines.length?[...proposed.split("\n").filter(line=>!(line.trimStart().startsWith("@")&&line.includes(":"))),...lines].join("\n"):proposed;
}

export function mergeShotDraft(text,draft,selected,seconds,contexts=null){
  const choices=draftChoices(text,draft),shots=readStory(text).shots,chosen=new Set(selected),result={},skipped=[];
  let changed=false,timing=false,shotChanged=false;
  for(const choice of choices){
    if(!chosen.has(choice.key))continue;
    if(choice.locked){skipped.push(choice.key);continue;}
    if(choice.shot_id===null){result[choice.field]=choice.value;changed=true;continue;}
    const shot=shots.find(shot=>shot.id===choice.shot_id),value=structuredClone(choice.value);
    if(choice.field==="timing"){
      if(!value||![value.start,value.end].every(n=>typeof n==="number"&&Number.isFinite(n))||value.start<0||value.end<=value.start||value.end>seconds)throw Error("Invalid proposed Shot timing.");
      shot.start=value.start;shot.end=value.end;timing=true;
    }else if(choice.field==="text"){
      if(typeof value!=="string"||!value.trim())throw Error("Empty proposed Shot text.");
      shot.text=keepWords(value,shot.text);
    }else{
      if(!Array.isArray(value))throw Error("Invalid proposed bindings or spoken lines.");
      if(choice.field==="spoken"){
        const original=shot.spoken.map(spokenValue),proposed=value.map(spokenValue);
        if(JSON.stringify(proposed.slice(0,original.length))!==JSON.stringify(original))throw Error("Keep existing spoken words and order.");
      }
      if(contexts){
        const ids=new Set(contexts.map(entry=>entry.widgets.context_id));
        const oldIds=new Set(shot[choice.field].map(entry=>entry.context_id||entry.speaker_id));
        if(value.some(entry=>{const id=entry.context_id||entry.speaker_id;return id&&!ids.has(id)&&!oldIds.has(id);}))throw Error("The draft binds an unavailable Context ID.");
      }
      shot[choice.field]=choice.field==="spoken"?[...shot.spoken,...value.slice(shot.spoken.length)]:value;
    }
    changed=true;shotChanged=true;
  }
  if(timing){
    const ordered=[...shots].sort((a,b)=>a.start-b.start);
    if(ordered.some((shot,index)=>index&&shot.start<ordered[index-1].end))throw Error("Selected timing overlaps another Shot. Choose compatible fields or edit manually.");
  }
  const saved=writeStory(shots),valid=readStory(saved);
  if(valid.error)throw Error(valid.error);
  if(!changed)throw Error("Select at least one unprotected field.");
  return {...(shotChanged?{shots:saved}:{}),...result,skipped};
}
