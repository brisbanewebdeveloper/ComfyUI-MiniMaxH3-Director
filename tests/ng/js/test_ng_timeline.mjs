import assert from "node:assert/strict";
import {readStory,writeStory,createShot} from "../../../js/ng/ng_story_model.js";
import {storyEditor} from "../../../js/ng/ng_story_editor.js";

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.style={};this.value="";}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(key,value){this.attributes[key]=String(value);}
  all(){return [this,...this.children.flatMap(child=>child.all())];}
  contains(node){return this.all().includes(node);}
  querySelectorAll(tag){return this.all().filter(element=>element!==this&&element.tag===tag);}
  getBoundingClientRect(){return {width:240};}
  setPointerCapture(id){this.captured=id;}
  releasePointerCapture(id){assert.equal(this.captured,id);this.captured=null;}
  checkValidity(){return true;}
}
globalThis.document={createElement:tag=>new Element(tag),dispatchEvent(){},activeElement:null};
globalThis.CustomEvent=class {};
const first=createShot({id:"first",start:0,end:4,text:"My original words",media:[{schema_version:1,context_id:"image",role:"context"}],
  spoken:[{schema_version:1,text:"Exact words"}],locked_fields:["timing","text"],draft:{text:"Separate proposal"}});
const second=createShot({id:"second",start:5,end:10,text:"Second action"});
const node={properties:{ng_selected_shot_id:"first"},widgets:[{name:"shots",value:writeStory([first,second])},
  {name:"project_seconds",value:10}],graph:{change(){}}};
const editor=storyEditor(node);
const data={ok:true,fps:24,requested_frames:240,total_frames:243,total_s:10.125,chunks:[
  {index:0,story_start_f:0,story_end_f:124,start_s:0,end_s:5.167,delivered_frames:124,sampled_frames:124,head_frames:0,shots:[{shot_id:"first"},{shot_id:"second"}]},
  {index:1,story_start_f:124,story_end_f:243,start_s:5.167,end_s:10.125,delivered_frames:119,sampled_frames:141,head_frames:22,shots:[{shot_id:"second",carried:true}]}]};
const all=()=>editor.root.all(),byClass=cls=>all().filter(element=>element.className===cls);
const label=name=>all().find(element=>element.attributes["aria-label"]===name);
editor.plan(data);
assert.ok(Math.abs(parseFloat(byClass("ng-story-block")[1].style.left)-5/10.125*100)<1e-8,"story shares the actual chunk axis");
assert.ok(Math.abs(parseFloat(byClass("ng-chunk-block")[1].style.left)-124/243*100)<1e-8,"chunk placement uses exact frames");
assert.ok(all().some(element=>element.textContent?.includes("Requested 10 s")&&element.textContent.includes("Delivered 10.125 s")));
assert.equal(byClass("ng-chunk-block")[0].attributes["aria-selected"],"true");
byClass("ng-shot-card")[1].onclick();
assert.equal(node.properties.ng_selected_shot_id,"second");
assert.ok(byClass("ng-chunk-block").every(element=>element.attributes["aria-selected"]==="true"),"selection uses actual compiler membership including carry");
const payloadBefore=node.widgets[0].value;
const later=label("Move shot 1 later");assert.ok(later);later.onclick();
let saved=readStory(node.widgets[0].value).shots;
assert.deepEqual(saved.map(shot=>[shot.id,shot.start,shot.end]),[["second",0,5],["first",6,10]]);
for(const key of ["text","media","spoken","locked_fields","draft"])assert.deepEqual(saved[1][key],first[key]);
assert.equal(byClass("ng-chunk-block").length,0,"editing clears stale chunks");
label("Move shot 2 earlier").onclick();assert.equal(node.widgets[0].value,payloadBefore,"reorder roundtrip preserves every field");
editor.plan(data);
let bar=byClass("ng-story-block")[0];
const event={pointerId:7,clientX:50,target:bar,stopPropagation(){},preventDefault(){}};
bar.onpointerdown(event);bar.onpointermove({clientX:74});bar.onpointercancel({pointerId:7});
assert.equal(node.widgets[0].value,payloadBefore,"cancel does not persist tentative timing");
bar=byClass("ng-story-block")[0];bar.onpointerdown({...event,target:bar});bar.onpointermove({clientX:74});bar.onpointerup({pointerId:7});
saved=readStory(node.widgets[0].value).shots;assert.ok(Math.abs(saved[0].start-1.0125)<1e-8,"drag uses the shared 10.125-second axis");
assert.equal(saved[0].end-saved[0].start,4);assert.equal(saved[0].id,"first");assert.equal(node.properties.ng_selected_shot_id,"first");
assert.equal(byClass("ng-chunk-block").length,0);
editor.plan(data);bar=byClass("ng-story-block")[0];
const end=bar.children.find(child=>child.dataset.part==="end");
bar.onpointerdown({...event,target:end});bar.onpointermove({clientX:500});bar.onpointerup({pointerId:7});
assert.equal(readStory(node.widgets[0].value).shots[0].end,10,"resize clamps to the requested story limit");
const beforeOverlap=node.widgets[0].value;label("Move shot 1 later").onclick();
assert.equal(node.widgets[0].value,beforeOverlap,"overlap is not silently rewritten by reorder");
assert.ok(all().some(element=>element.textContent?.includes("overlap")));
let stopped=false;label("Remove shot 1").onclick({stopPropagation(){stopped=true;}});
assert.equal(stopped,true,"removal must not bubble into selecting the removed card");
assert.equal(node.properties.ng_selected_shot_id,"second","selection moves to a remaining stable ID");
node.widgets[1].value=10.02;editor.plan(data);
assert.ok(all().some(element=>element.textContent?.includes("Requested 10.02 s")),"the requested label retains the user's subframe wish");
assert.ok(Math.abs(parseFloat(byClass("ng-requested-end")[0].style.left)-10.02/10.125*100)<1e-8);
editor.dispose();console.log("ng timeline: shared frame axis, requested/delivered truth, membership, reorder, drag, resize, cancel and stale clearing passed");
