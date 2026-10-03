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
globalThis.document={createElement:tag=>new Element(tag),dispatchEvent:()=>{},getElementById:()=>null,head:new Element("head")};
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

// The Text card owns a separate stylesheet, so restyling it towards the reference image cannot reach the
// image, video, audio or product cards. Both halves of that promise are checked here.
const sharedSheet=(await import("node:fs")).readFileSync(new URL("../../../js/ng/ng_studio_style.js",import.meta.url),"utf8");
const textSheet=(await import("node:fs")).readFileSync(new URL("../../../js/ng/ng_context_text_style.js",import.meta.url),"utf8");
const sharedRules=sharedSheet.slice(sharedSheet.indexOf("const CSS = `")+13,sharedSheet.lastIndexOf("`;")).replace(/\/\*[\s\S]*?\*\//g,"");
const textRules=textSheet.slice(textSheet.indexOf("const CSS = `")+13,textSheet.lastIndexOf("`;"));
const otherMedia=/\.ng-studio-context(?![^\n]*data-media=text)[^{]*\.(ng-text-workspace|ng-text-sidebar|ng-text-main|ng-text-count|ng-editor-overlay|ng-quick-insert|ng-template-placeholder)\b/;
assert.doesNotMatch(sharedRules,otherMedia,
  "the shared sheet must not style the Text card's own classes; they belong in ng_context_text_style.js");
assert.doesNotMatch(sharedRules,/\[data-media=text\]/,
  "the shared sheet must not carry [data-media=text] rules; the Text card keeps them itself");
for(const rule of textRules.replace(/\/\*[\s\S]*?\*\//g,"").split("}")){
  if(!rule.includes("{"))continue;
  const selector=rule.slice(0,rule.indexOf("{")).trim();
  if(!selector)continue;
  assert.match(selector,/^\.ng-studio-context\[data-media=text\]/,
    "every Text rule has to be scoped to its own card, found: "+selector);
}
assert.match(document.head.children.map(node=>node.id).join(","),/ng-context-text-style/,
  "textEditor injects the Text stylesheet");
console.log("Context text stylesheet: shared sheet stays free of Text rules, every Text rule is scoped to its card");

// The card follows `H3 Context Text.png`: a live "298 / 2000" counter inside the editor, an icon per
// Quick Insert row, one tone per kind that the matching bracket token reuses, and template tiles that
// carry their own icon. These are the promises the redesign has to keep on every later change.
const rich=widgets=>Object.entries(widgets).map(([name,value])=>({name,value}));
const styled={id:9,comfyClass:"NGContextText",properties:{},widgets:rich({context_id:"rules",name:"Rules",
  text:"[character] walks. [unknown_kind] stays. Keep @Alice."}),outputs:[{links:[21]}]};
// change() marks the graph dirty; the fixture carries it because applying a template does the same
// every other panel in the card does when the user picks a value.
styled.graph={links:{21:{origin_id:9,target_id:10}},getNodeById:id=>[styled,connector].find(node=>node.id===id),change(){}};
const card=textEditor(styled);
const count=card.root.all().find(node=>node.className==="ng-text-count");
assert.equal(count.textContent,`${styled.widgets.find(w=>w.name==="text").value.length} / 2000`,
  "the counter reads length / limit, the way the reference shows it");
assert.equal(count.dataset.over,"false","a note within the limit is not marked as over");
styled.widgets.find(widget=>widget.name==="text").value="x".repeat(2400);
card.sync();
assert.equal(count.dataset.over,"true","an over-long note is flagged instead of being silently truncated");
styled.widgets.find(widget=>widget.name==="text").value="[character] walks. [unknown_kind] stays.";

const quick=card.root.all().filter(node=>node.className==="ng-quick-insert");
assert.equal(quick.length,8,"one Quick Insert row per content kind");
for(const button of quick){
  assert.ok(button.dataset.tone,`Quick Insert ${button.dataset.kind} carries a tone`);
  assert.ok(button.children.length===2&&button.children[0].className==="ng-quick-icon",
    `Quick Insert ${button.dataset.kind} shows an icon next to its label`);
}
const tones=quick.map(button=>button.dataset.tone);
assert.equal(new Set(tones).size,tones.length,"each kind has its own tone, none is duplicated");

const tiles=card.root.all().filter(node=>node.className==="ng-text-example");
assert.equal(tiles.length,7,"one template tile per template");
for(const tile of tiles)assert.ok(tile.children[0].className==="ng-example-icon",`${tile.textContent} tile shows an icon`);

// A tone may only be used by a kind the prompt builder actually resolves. The mock-up's decorative
// `[camera_rule]`/`[atmosphere]` names describe no field, so they must not appear as coloured tokens.
card.sync();
const placeholders=card.root.all().filter(node=>node.className==="ng-template-placeholder");
assert.equal(placeholders.length,2,"both bracket tokens are highlighted");
assert.equal(placeholders[0].dataset.tone,tones[0],"a known kind gets its own colour in the editor");
assert.equal(placeholders[1].dataset.tone,undefined,"an unknown bracket stays neutral instead of borrowing a colour");
assert.doesNotMatch(card.root.all().filter(n=>n.tag==="select")[0].children.map(n=>n.textContent).join("|"),/camera_rule|atmosphere/,
  "the reference's decorative token names are not introduced as templates");
assert.ok(card.root.all().some(node=>node.className==="ng-text-grow"),"the editor keeps the reference's grow button");

// Choosing a template writes that template's own text, and the button icon follows the choice.
const picker=card.root.all().filter(node=>node.tag==="select")[0];
const useButton=card.root.all().find(node=>node.className==="ng-template-use");
picker.value="Dialogue Rules";picker.onchange();
assert.ok(useButton.children[0].className==="ng-template-icon","Use Template keeps an icon");
useButton.onclick();
assert.equal(styled.widgets.find(widget=>widget.name==="text").value,
  "@Character says: write the exact dialogue here.","the chosen template's own text is written");
// An example tile selects its template and applies it in one click, like the reference's tiles.
// The handler is invoked directly: it is what a click runs, without depending on a DOM click().
const tile=card.root.all().find(node=>node.className==="ng-text-example"&&node.children[1].textContent==="Camera Rules");
tile.onclick();
assert.match(styled.widgets.find(widget=>widget.name==="text").value,/framing, camera movement and lens/,
  "an example tile applies the template it stands for");
console.log("Context text reference layout: counter, kind icons and tones, token colours, template tiles");
