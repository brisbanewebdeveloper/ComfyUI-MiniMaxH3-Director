import assert from "node:assert/strict";
import {textEditor} from "../../../js/ng/ng_context_text.js";
import {inspector} from "../../../js/ng/ng_inspector.js";

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.classList={add:()=>{}};this.dataset={};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(){}
  all(){return [this,...this.children.flatMap(child=>child.all())];}
}
globalThis.document={createElement:tag=>new Element(tag),dispatchEvent:()=>{}};
globalThis.CustomEvent=class {};

const widgets=data=>Object.entries(data).map(([name,value])=>({name,value}));
const alice={id:1,comfyClass:"NGContextImage",widgets:widgets({context_id:"alice",name:"Straße"})};
const bob={id:2,comfyClass:"NGContextImage",widgets:widgets({context_id:"bob",name:"Bob"})};
const text={id:3,comfyClass:"NGContextText",properties:{},widgets:widgets({context_id:"rules",name:"Rules",
  text:"Keep @STRASSE and @Bob visible. Leave @Bobby alone. Track @bob."}),outputs:[{links:[13]}]};
const connector={id:4,comfyClass:"NGContextConnector",inputs:[
  {name:"context_image.image_0",link:11},{name:"context_image.image_1",link:12},{name:"context_text.text_0",link:13}]};
const nodes=[alice,bob,text,connector];
text.graph={links:{11:{origin_id:1,target_id:4},12:{origin_id:2,target_id:4},13:{origin_id:3,target_id:4}},
  getNodeById:id=>nodes.find(node=>node.id===id)};
connector.graph=text.graph;
const editor=textEditor(text),field=editor.root.all().find(element=>element.tag==="textarea");
assert.match(field.value,/@STRASSE and @Bob/);
alice.widgets.find(widget=>widget.name==="name").value="Alice";
bob.widgets.find(widget=>widget.name==="name").value="Bob Neu";
editor.sync();
const expected="Keep @Alice and @Bob Neu visible. Leave @Bobby alone. Track @Bob Neu.";
assert.equal(text.widgets.find(widget=>widget.name==="text").value,expected,"persist the renamed Context text");
assert.equal(field.value,expected,"the visible editor follows the saved text");
editor.sync();
assert.equal(field.value,expected,"repeated updates cannot append the new name twice");

const saved=JSON.parse(JSON.stringify(text.properties));
text.properties=saved;
bob.widgets.find(widget=>widget.name==="name").value="Robert";
editor.sync();
assert.equal(field.value,"Keep @Alice and @Robert visible. Leave @Bobby alone. Track @Robert.","restore the previous ID/name map");
console.log("Context text rename: Unicode, multi-word names, prefix boundary, stable IDs and restored properties passed");

const panel=inspector({properties:{},widgets:widgets({mode:"auto",prompt_override:""})});
panel.render({mode:"ref2va",director_context:{},chunks:[{index:0,prompt:"",refs:[
  {kind:"picture",ctx_id:"alice"},{kind:"picture",ctx_id:"coat"},{kind:"picture",ctx_id:"bob"},
  {kind:"picture",ctx_id:"coat"},{kind:"video",ctx_id:"move"},{kind:"audio",ctx_id:"voice_a"},
  {kind:"audio",ctx_id:"voice_b"}]}]},[]);
const budget=()=>panel.root.all().find(element=>element.textContent?.startsWith("Context budget"))?.textContent;
assert.equal(budget(),"Context budget per chunk · Images 4/9 · Video 1/3 · Audio 2/3 · Total up to 7/12",
  "a shared asset consumes one native Picture slot per Subject");
console.log("Inspector budget: shared Picture presentations consume distinct native slots");

panel.render({mode:"ref2va",director_context:{},chunks:[{index:0,prompt:"",refs:[
  {kind:"picture",ctx_id:"alice"},{kind:"picture",ctx_id:"coat"},{kind:"picture",ctx_id:"bob"},
  {kind:"picture",ctx_id:"coat"},{kind:"picture",ctx_id:"start"},{kind:"first_frame",ctx_id:"start"},
  {kind:"continue_video",ctx_id:"move"},{kind:"keyframe",ctx_id:"key"},{kind:"lock",ctx_id:"sound"},
  {kind:"audio",ctx_id:"voice_a"},{kind:"audio",ctx_id:"voice_b"}]}]},[]);
assert.equal(budget(),"Context budget per chunk · Images 5/9 · Video 0/3 · Audio 2/3 · Total up to 7/12",
  "a Ref2VA frame anchor uses its existing Picture slot; AddGuide and locked audio are not reference tokens");
panel.render({mode:"fl2va",director_context:{},chunks:[{index:0,prompt:"",refs:[
  {kind:"first_frame",ctx_id:"frame"},{kind:"last_frame",ctx_id:"frame"}]}]},[]);
assert.equal(budget(),"Context budget per chunk · Images 2/9 · Video 0/3 · Audio 0/3 · Total up to 2/12",
  "native First and Last are two Picture presentations even when they use the same card");
console.log("Inspector budget: frame anchors and unnumbered guides match native presentation");
