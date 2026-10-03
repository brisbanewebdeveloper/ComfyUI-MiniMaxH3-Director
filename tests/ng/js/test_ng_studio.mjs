import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";

class Element {
  constructor(tag) {
    this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.className="";this.value="";
    this.style={setProperty(){}};this.classList={add:(name)=>{this.className+=" "+name;}};
  }
  append(...nodes){this.children.push(...nodes);}
  appendChild(node){this.append(node);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  contains(node){return this.all().includes(node);}
  all(){return [this,...this.children.flatMap(child=>child.all())];}
  querySelectorAll(tag){return this.all().filter(element=>element!==this&&element.tag===tag);}
  checkValidity(){return true;}
}
globalThis.document={createElement:tag=>new Element(tag),getElementById:()=>null,head:new Element("head"),
  addEventListener(){},dispatchEvent(){}};
globalThis.CustomEvent=class {};
const extensions=[];
const app={registerExtension:extension=>extensions.push(extension)};
const api={addEventListener(){},removeEventListener(){}};
globalThis.window={comfyAPI:{app:{app},api:{api}}};
const timers=new Map();let timerId=0;
globalThis.setTimeout=fn=>{timers.set(++timerId,fn);return timerId;};
globalThis.clearTimeout=id=>timers.delete(id);
await import("../../../js/ng/ng_studio.js");
await import("../../../js/ng/ng_panel.js");
const fields={idea:"My original idea",project_seconds:10,chunk_seconds:5,width:1024,height:576,
  mode:"auto",continuity:"video_audio",pin_frames:"22",shots:"0-4 | Walk.\n4-10 | Wave.",
  style:"None",soundscape:"Rain",music:"N/A",seed:42,steps:20,sampler_name:"res_multistep",
  scheduler:"simple",shift_video:12,shift_audio:3,prompt_override:""};
const choices={pin_frames:["22","5","39","56"],mode:["auto","fl2va","ref2va"],continuity:["video_audio","video","none"],
  style:["None","Cinematic"],sampler_name:["res_multistep","euler"],scheduler:["simple","normal"]};
function createNode(type,view) {
  const node={comfyClass:type,properties:{ng_view_mode:view,ng_assist_mode:"manual"},size:[320,200],
    inputs:[],outputs:[],widgets:Object.entries(fields).map(([name,value])=>({name,value,options:choices[name]?{values:choices[name]}:{}})),
    graph:{change(){}},setDirtyCanvas(){},setSize(size){this.size=[...size];},
    addDOMWidget(name,type,element,options){const widget={name,type,element,options};this.widgets.push(widget);return widget;}};
  extensions.forEach(extension=>extension.nodeCreated(node));return node;
}
function controls(node){return node.widgets.find(widget=>widget.element).element.all();}
function labelled(node,label){return controls(node).find(element=>element.attributes["aria-label"]===label);}

for(const view of ["simple","guided","expert"]) {
  const node=createNode("NGH3Director",view);
  assert.equal(node.properties.ng_view_mode,undefined,"old saved view state must be discarded");
  assert.deepEqual(Object.fromEntries(node.widgets.filter(widget=>widget.name in fields).map(widget=>[widget.name,widget.value])),fields,
    "removing view state must not rewrite any render or story input");
  assert.ok(!controls(node).some(element=>["Simple","Guided","Expert"].includes(element.textContent)),"no presentation buttons");
  for(const label of ["Project · seconds","Chunk Length · 0 = Auto","Width","Height","Seed","Steps","Sampler","Scheduler"]) {
    const field=labelled(node,label);assert.ok(field&&!field.disabled,`${label} must be editable without AI`);
    const ancestors=controls(node).filter(element=>element.contains(field));
    assert.ok(!ancestors.some(element=>element.tag==="details"),`${label} must not require opening details`);
  }
  assert.ok(controls(node).some(element=>element.className==="ng-story-timeline"),"Story track stays available");
  assert.ok(controls(node).some(element=>element.className==="ng-generation-track"),"Chunk track stays available");
  assert.ok(controls(node).some(element=>element.textContent==="Manual"),"AI action controls remain available");
  const pin=labelled(node,"Pinned frames");pin.value="5";pin.oninput();
  assert.equal(node.widgets.find(widget=>widget.name==="pin_frames").value,"5","native string combos must retain their schema type");
  const seed=labelled(node,"Seed");seed.value="123";seed.oninput();
  assert.equal(node.widgets.find(widget=>widget.name==="seed").value,123,"visible controls still write serialized widgets");
  node.size=[777,888];node.properties.ng_view_mode=view;node.properties.ng_assist_mode="auto";node.onConfigure();
  assert.deepEqual(node.size,[777,888],"configuring must preserve the user's saved size");
  assert.equal(node.properties.ng_view_mode,undefined,"reload must also discard obsolete view state");
  assert.equal(node.properties.ng_assist_mode,"auto","reload must preserve AI action permission");
  assert.equal(controls(node).find(element=>element.textContent==="Auto").attributes["aria-pressed"],"true",
    "the AI buttons must reflect the saved choice, not the state from node creation");
  assert.equal(labelled(node,"Seed").value,123,"configure synchronizes the visible control");
  node.onRemoved();
}
for(const view of ["simple","guided","expert"]) {
  const node=createNode("NGDirector",view);
  assert.equal(node.properties.ng_view_mode,undefined,"technical planner drops old view state too");
  node.properties.ng_view_mode=view;node.onConfigure();
  assert.equal(node.properties.ng_view_mode,undefined);node.onRemoved();
}
{
  const node=createNode("NGH3Director","simple"),widget=node.widgets.find(widget=>widget.name==="shots");
  widget.value="0-10: Original action.";widget.callback(widget.value);
  const dialogue=controls(node).find(element=>element.className==="ng-shot-dialogue");dialogue.open=true;
  labelled(node,"Add shot 1 spoken line").onclick();
  assert.equal(controls(node).find(element=>element.className==="ng-shot-dialogue").open,true,
    "adding a line must retain the opened dialogue controls");
  const protectedField=labelled(node,"Protect shot 1 spoken from AI");protectedField.checked=true;protectedField.onchange();
  assert.ok(controls(node).some(element=>element.textContent==="Protect from AI · 1 fields"),"protection caption updates immediately");
  assert.equal(JSON.parse(widget.value).shots[0].id,"legacy-shot-1","UI migration preserves the source shot identity");
  node.onRemoved();
}
assert.equal(timers.size,0,"removed nodes must not leave preview updates scheduled");
const source=name=>readFileSync(new URL("../../../js/ng/"+name,import.meta.url),"utf8");
for(const file of ["ng_style.js","ng_studio_style.js"]) {
  assert.doesNotMatch(source(file),/data-mode=(?:simple|guided|expert)|ng-guided|ng-expert/,"old visibility CSS must be gone");
}
assert.equal(existsSync(new URL("../../../js/ng/ng_modes.js",import.meta.url)),false,"obsolete module is removed");
console.log("ng studio: old workflow views, visible inputs, unchanged values, AI controls, resize and reload passed");
