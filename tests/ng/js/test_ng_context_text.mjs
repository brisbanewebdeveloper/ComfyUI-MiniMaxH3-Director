import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspector} from "../../../js/ng/ng_inspector.js";
import {CONTENT} from "../../../js/ng/ng_context_controls.js";

// The Text card reaches the AI through the shared transport, which reads `window.comfyAPI` while it
// is imported. An ESM import always runs before this file's own statements, so the browser stand-in
// is installed first and the card module is pulled in afterwards. The provider answers with a fixed
// prompt, which is what the card is then asked to show.
const sent={prompt:"[Shot 1] A girl in a red coat crosses the yard as the camera pushes in."};
globalThis.window={comfyAPI:{api:{fetchApi:async()=>({json:async()=>({ok:true,suggestion:sent})})},
  app:{graph:{getNodeById:()=>null}}}};
globalThis.comfyAPI=globalThis.window.comfyAPI;
const {textEditor}=await import("../../../js/ng/ng_context_text.js");

// The Quick Insert rows name content kinds, and the backend decides which kinds a text note may
// carry. The Python source is read as text rather than imported: this suite runs under node, and
// being the one place both lists are compared is what stops them drifting apart.
const contextSource=readFileSync(new URL("../../../ng/core/context.py",import.meta.url),"utf8");
const quoted=(source)=>[...source.matchAll(/"([a-z_]+)"/g)].map(match=>match[1]);
// The two names are anchored on their assignment, so a dictionary key such as "text" is never
// mistaken for the tuple it sits in.
const textKinds=quoted(contextSource.slice(contextSource.indexOf('"text": ('),
  contextSource.indexOf("),\n}",contextSource.indexOf('"text": ('))));
const allKinds=quoted(contextSource.slice(contextSource.indexOf("CONTENT_KINDS = ("),
  contextSource.indexOf(")\n#",contextSource.indexOf("CONTENT_KINDS = ("))));

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.classList={add:()=>{}};this.dataset={};this.attributes={};
    this.hidden=false;this.disabled=false;
    // A textarea/input carries a value in the browser; the build panel writes one and reads it back.
    // Without it here the panel would silently look empty, which is exactly the failure the suite
    // is meant to catch rather than paper over.
    if(tag==="textarea"||tag==="input")this.value="";
    // textContent and the attribute store are real, not stubs: the note/AI switch states itself
    // through aria-pressed and through its own label, and a stub that dropped both would let a
    // switch that never updates pass.
    this._text="";}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return name in this.attributes?this.attributes[name]:null;}
  get textContent(){return this._text;}
  set textContent(value){this._text=String(value);}
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
// The AI provider the card finds through its own connection. The build button reads it exactly the
// way the browser does, so a card with no provider must leave the button disabled.
const loader={id:7,comfyClass:"NGAIProvider",widgets:rich({provider:"ollama",model:"qwen3",base_url:"",source:"api",
  api_key_env:"",vision:false,audio:false,timeout_seconds:120,max_tokens:512,keep_alive:0,temperature:0.7,
  top_p:0.9,top_k:40,min_p:0,fixed_seed:false,seed:0,frequency_penalty:0,presence_penalty:0})};
styled.inputs=[{name:"ai_provider",link:22}];
styled.graph={links:{21:{origin_id:9,target_id:10},22:{origin_id:7,target_id:9}},
  getNodeById:id=>[styled,connector,loader].find(node=>node.id===id),change(){}};
loader.graph=styled.graph;
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
assert.equal(quick.length,CONTENT.text.length,"one Quick Insert row per content kind");
for(const button of quick){
  assert.ok(button.dataset.tone,`Quick Insert ${button.dataset.kind} carries a tone`);
  assert.ok(button.children.length===2&&button.children[0].className==="ng-quick-icon",
    `Quick Insert ${button.dataset.kind} shows an icon next to its label`);
}
const tones=quick.map(button=>button.dataset.tone);
assert.equal(new Set(tones).size,tones.length,"each kind has its own tone, none is duplicated");

// A Quick Insert token is only useful if the prompt builder accepts it. This is the contract that
// stopped the card from offering names the backend would report as unknown content kinds.
assert.deepEqual(CONTENT.text.map(entry=>entry[0]),[...new Set(CONTENT.text.map(entry=>entry[0]))],
  "no kind is listed twice");
for(const [key] of CONTENT.text){
  assert.ok(textKinds.includes(key),`${key} is a content kind a text note may carry`);
  assert.ok(allKinds.includes(key),`${key} is a known content kind`);
}
// The sound fields are two of the three the H3 prompt is built from, so a note must be able to
// reach them. They had no row at all before.
for(const key of ["dialogue","voice","ambience","music","sound_effect","shot"]){
  assert.ok(CONTENT.text.some(entry=>entry[0]===key),`Quick Insert offers ${key}`);
}

// A tone may only be used by a kind the prompt builder actually resolves. The mock-up's decorative
// `[camera_rule]`/`[atmosphere]` names describe no field, so they must not appear as coloured tokens.
card.sync();
const placeholders=card.root.all().filter(node=>node.className==="ng-template-placeholder");
assert.equal(placeholders.length,2,"both bracket tokens are highlighted");
assert.equal(placeholders[0].dataset.tone,
  quick.find(button=>button.dataset.kind==="character").dataset.tone,
  "a known kind gets its own colour in the editor");
assert.equal(placeholders[1].dataset.tone,undefined,"an unknown bracket stays neutral instead of borrowing a colour");
assert.doesNotMatch(CONTENT.text.map(entry=>entry[0]).join("|"),/camera_rule|atmosphere/,
  "the reference's decorative token names are not introduced as kinds");
assert.ok(card.root.all().some(node=>node.className==="ng-text-grow"),"the editor keeps the reference's grow button");

// The card is a text-to-video note now. Templates and example tiles were Claude's invention for a
// free-text box; they wrote placeholder sentences into the one field the AI button reads, so the
// user's own words had to be deleted before the prompt could be built. Neither has a place left.
for(const gone of ["ng-template-use","ng-text-example","ng-template-row"]){
  assert.ok(!card.root.all().some(node=>node.className===gone),`${gone} is gone from the Text card`);
}
// A note has no medium, so there is nothing for "Use As" to point at. The other three cards keep it.
assert.ok(!card.root.all().some(node=>node.className==="ng-option-row"),"the Text card has no Use As list");

// One AI action, and it is the button the card exists for.
const go=card.root.all().find(node=>node.className==="ng-build-go");
assert.ok(go,"the card offers Build H3 Prompt");
assert.equal(go.children[0].className,"ng-build-icon","the build button shows an icon");
const block=card.root.all().filter(node=>node.tag==="select")[0];
assert.deepEqual(block.children.map(option=>option.value),["global","storyboard"],
  "both prompt blocks the enhance node produces are offered");
const length=card.root.all().find(node=>node.type==="number");
assert.equal(length.min,"4","the length field starts at the model's shortest video");
assert.equal(length.max,"15","the length field stops at the model's longest video");
assert.equal(length.value,"8","the length field opens on a mid-range video");
// The button reads the visible editor, not the widget, so the fixture has to put the note there
// the way the card's own sync does.
// The button reads the visible editor, not the widget, so the fixture has to put the note there
// the way the card's own sync does. The card holds several textareas, so the editor is the
// classless one - the answer box and the analysis box both carry a class.
const note=card.root.all().find(node=>node.tag==="textarea"&&node.className==="");
note.value="[character] walks. [unknown_kind] stays.";
// The duration is part of what the AI is told, so it may never leave the model's accepted range.
for(const [given,expected] of [["1","4"],["99","15"],["abc","8"],["12","12"]]){
  length.value=given;await go.onclick();
  assert.equal(length.value,expected,`a typed length of ${given} is clamped to ${expected}`);
}
// A finished build lands in the AI version and flips the switch to it. The note is not thrown away:
// it is kept, so the switch can bring it back. This replaces "Use this prompt" / "Restore my text",
// which both moved the same text back and forth and disagreed about whether the note still existed.
assert.equal(styled.widgets.find(widget=>widget.name==="text").value,sent.prompt,
  "the built prompt is what the editor shows");
assert.equal(styled.properties.ng_text_note,"[character] walks. [unknown_kind] stays.",
  "the note is kept, so the switch can go back");
assert.equal(styled.properties.ng_text_ai,sent.prompt,"the built prompt is kept as its own version");
const answer=card.root.all().find(node=>node.className==="ng-build-answer");
assert.equal(answer.value,sent.prompt,`the answer lands in the box the user reads first (hint: ${card.root.all().find(node=>node.tagName==="small")?.textContent})`);

const switcher=card.root.all().find(node=>node.className==="ng-text-switch");
assert.ok(switcher,"one switch chooses between the note and the built prompt");
const noteSide=card.root.all().find(node=>node.className==="ng-text-switch-btn"&&node.textContent.includes("My note"));
const aiSide=card.root.all().find(node=>node.className==="ng-text-switch-btn"&&node.textContent.includes("AI prompt"));
assert.equal(switcher.dataset.mode,"ai","the switch starts on the version the build produced");
assert.equal(aiSide.getAttribute("aria-pressed"),"true","the shown side is the pressed one");
assert.equal(noteSide.getAttribute("aria-pressed"),"false","the hidden side is not pressed");
// Going back has to restore the note exactly, not an empty string left behind by the swap.
noteSide.onclick();
assert.equal(switcher.dataset.mode,"note","the switch moves to the note");
assert.equal(styled.widgets.find(widget=>widget.name==="text").value,"[character] walks. [unknown_kind] stays.",
  "the note comes back through the switch");
assert.equal(noteSide.getAttribute("aria-pressed"),"true","the note is now the pressed side");
// And forth again, so neither direction can be a one-way street.
aiSide.onclick();
assert.equal(styled.widgets.find(widget=>widget.name==="text").value,sent.prompt,"and back to the built prompt");
console.log("Context text card: real H3 kinds incl. sound, one AI button, a lossless note/AI switch");
