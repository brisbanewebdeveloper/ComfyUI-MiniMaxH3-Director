import assert from "node:assert/strict";
import {mergeShotDraft, choiceKey, draftChoices,displayDraftValue} from "../../../js/ng/ng_shot_draft.js";
import {writeStory, readStory, createShot} from "../../../js/ng/ng_story_model.js";

const original=[createShot({id:"a",start:0,end:4,text:"Walk.\n@Alice says: Original words.",
  media:[{schema_version:1,context_id:"alice",role:"reference"}],locked_fields:["timing"],draft:{old:"kept"}}),
  createShot({id:"b",start:4,end:8,text:"Wait.",spoken:[{schema_version:1,text:"Mein Dialog."}]})];
const source=writeStory(original);
assert.equal(displayDraftValue("media",original[0].media,[{widgets:{context_id:"alice",name:"Alice"}}]),"Alice · reference");
assert.equal(displayDraftValue("timing",{start:1,end:3},[]),"1–3 s");
const proposal={format:"h3-director-draft",schema_version:1,patches:[
  {shot_id:"b",fields:{text:"Turn.",timing:{start:3,end:8},media:[]}},
  {shot_id:"a",fields:{text:"Look.\n@Alice says: Changed.",timing:{start:1,end:4},media:[]}}],soundscape:"Wind"};
const merged=mergeShotDraft(source,proposal,[choiceKey("a","text"),choiceKey("a","timing")],8);
const shots=readStory(merged.shots).shots;
assert.equal(shots[0].text,"Look.\n@Alice says: Original words.");
assert.deepEqual({...shots[0],text:original[0].text},original[0],"all unselected and protected fields survive");
assert.deepEqual(shots[1],original[1]);
assert.deepEqual(merged.skipped,[choiceKey("a","timing")]);
assert.equal(merged.soundscape,undefined);
assert.equal(mergeShotDraft(source,proposal,[choiceKey(null,"soundscape")],8).soundscape,"Wind");
assert.equal(mergeShotDraft(source,proposal,[choiceKey(null,"soundscape")],8).shots,undefined,"project-only Apply never rewrites shots");
assert.throws(()=>mergeShotDraft(source,proposal,[choiceKey("b","timing"),choiceKey("a","text")],8),/overlap/i,"merge is atomic");
assert.equal(source,writeStory(original));
assert.equal(draftChoices(source,proposal).find(field=>field.shot_id==="a"&&field.field==="timing").locked,true);
for(const bad of [{...proposal,schema_version:2},{...proposal,patches:[{shot_id:"unknown",fields:{text:"x"}}]},
  {...proposal,patches:[proposal.patches[0],proposal.patches[0]]},
  {...proposal,patches:[{shot_id:"a",fields:{locked_fields:[]}}]}]) assert.throws(()=>mergeShotDraft(source,bad,[],8));
assert.throws(()=>mergeShotDraft(source,{...proposal,patches:[{shot_id:"b",fields:{spoken:[]}}]},[choiceKey("b","spoken")],8),/spoken/i);

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.style={};this.value="";}
  append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(key,value){this.attributes[key]=String(value);} all(){return [this,...this.children.flatMap(node=>node.all())];}
}
globalThis.document={createElement:tag=>new Element(tag),dispatchEvent(){}};
globalThis.CustomEvent=class {};
globalThis.window={comfyAPI:{app:{app:{}}}};
const {directionTools}=await import("../../../js/ng/ng_direction.js");
let resolveRequest,requests=0,changes=0;
const provider={id:2,comfyClass:"NGAIProvider",widgets:[{name:"provider",value:"ollama"},{name:"model",value:"fixture"}]};
const node={comfyClass:"NGDirector",properties:{ng_assist_mode:"auto"},inputs:[{name:"ai_provider",link:1}],
  widgets:Object.entries({idea:"Walk.",project_seconds:8,shots:source,soundscape:"Room",music:"N/A"}).map(([name,value])=>({name,value})),
  graph:{links:{1:{origin_id:2}},getNodeById:id=>id===2?provider:null,change(){changes++;}},setDirtyCanvas(){}};
const api={fetchApi(){requests++;return new Promise(resolve=>resolveRequest=()=>resolve({json:async()=>({ok:true,suggestion:proposal})}));}};
let panel=directionTools(node,api);
const button=text=>panel.root.all().find(item=>item.textContent===text);
const label=name=>panel.root.all().find(item=>item.attributes["aria-label"]===name);
let running=button("✨ Auto Direct").onclick();resolveRequest();await running;
assert.equal(node.widgets.find(w=>w.name==="shots").value,source,"request never writes active shots");
assert.ok(node.properties.ng_direction_draft,"pending proposal survives serialization");
assert.ok(label("Apply Shot 1 text").checked);
assert.ok(label("Apply Shot 1 timing").disabled);
assert.equal(label("Apply Shot 2 timing").checked,false,"timing is explicit opt-in");
panel.dispose();panel=directionTools(node,api);
assert.ok(label("Apply Shot 1 text").checked,"reload restores a reviewable pending proposal");
button("Apply selected fields").onclick();
const applied=readStory(node.widgets.find(w=>w.name==="shots").value).shots;
assert.equal(applied[0].text,"Look.\n@Alice says: Original words.");
assert.equal(applied[1].text,"Turn.");
assert.deepEqual(applied[0].media,original[0].media);
assert.deepEqual(applied[1].spoken,original[1].spoken);
assert.equal(node.properties.ng_direction_draft,undefined);
running=button("✨ Auto Direct").onclick();
node.widgets.find(w=>w.name==="idea").value="Manual change.";
resolveRequest();await running;panel.sync();
assert.ok(button("Apply selected fields").disabled,"changed project makes draft stale");
const before=node.widgets.find(w=>w.name==="shots").value;
button("Apply selected fields").onclick();assert.equal(node.widgets.find(w=>w.name==="shots").value,before);
button("Discard suggestion").onclick();
running=button("✨ Auto Direct").onclick();button("Cancel AI").onclick();resolveRequest();await running;
assert.equal(node.properties.ng_direction_draft,undefined,"late answer after cancel cannot resurrect draft");
assert.equal(node.widgets.find(w=>w.name==="shots").value,before);
running=button("✨ Auto Direct").onclick();panel.dispose();resolveRequest();await running;
assert.equal(node.properties.ng_direction_draft,undefined,"removed panel ignores late response");
assert.equal(requests,4);assert.ok(changes>0);
console.log("ng direction: ID fields, locks, dialogue, atomic timing conflicts, review/reload, stale, cancel and late responses passed");
