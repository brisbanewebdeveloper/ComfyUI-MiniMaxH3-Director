import assert from "node:assert/strict";
import {createShot, readStory, writeStory} from "../../../js/ng/ng_story_model.js";
import {shotMedia, shotMediaView} from "../../../js/ng/ng_shot_media.js";
import {storyEditor} from "../../../js/ng/ng_story_editor.js";

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.style={};this.hidden=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(key,value){this.attributes[key]=String(value);}
  all(){return [this,...this.children.flatMap(child=>child.all())];}
  contains(node){return this.all().includes(node);}
  querySelectorAll(tag){return this.all().filter(element=>element!==this&&element.tag===tag);}
}
globalThis.document={createElement:tag=>new Element(tag)};
document.dispatchEvent=()=>{};globalThis.CustomEvent=class {};
const context=(id,media,content=media,extra={})=>({media,widgets:{context_id:id,name:id,[media]:id+".file",content,color:"#123456",...extra}});
const entries=[context("a","image"),context("v","video"),context("music","audio","music"),context("sing","audio","singing"),
  context("voice","audio","voice"),context("fx","audio","sound_effect"),context("room","audio","ambience"),context("note","text")];
const shot=createShot({start:0,end:8,text:"My own action."});
shot.media=entries.map(entry=>({schema_version:1,context_id:entry.widgets.context_id,role:"context"}));
shot.spoken=[{schema_version:1,text:"Original words",speaker_id:"",language:"English"}];
const original=writeStory([shot]);
let marks=shotMedia(shot,entries);
assert.deepEqual(new Set(marks.map(mark=>mark.kind)),new Set(["text","image","video","music","singing","voice","sound","ambience","dialogue"]));
assert.ok(marks.filter(mark=>mark.entry).every(mark=>mark.color==="#123456"));
assert.equal(writeStory([shot]),original,"display must never rewrite active shot data");
const mention=createShot({text:"@Bobby walks. @STRASSE follows."});
marks=shotMedia(mention,[context("bob","image","character",{name:"Bob"}),context("bobby","video","motion",{name:"Bobby"}),context("street","image","environment",{name:"Straße"})]);
assert.deepEqual(marks.filter(mark=>mark.entry).map(mark=>mark.contextId),["bobby","street"],"use compiler-compatible mention boundaries and casefold aliases");
shot.media.push({schema_version:1,context_id:"missing",role:"context"});
assert.equal(shotMedia(shot,entries).find(mark=>mark.contextId==="missing").kind,"missing");
assert.deepEqual(readStory(writeStory([shot])).shots[0].media,shot.media);
const singer=context("mixed","audio","voice",{content_roles:'["singing","music","voice"]'});
assert.deepEqual(new Set(shotMedia(createShot({text:"@mixed"}),[singer]).filter(mark=>mark.entry).map(mark=>mark.kind)),new Set(["singing","music","voice"]));

const pending=[],calls=[];
const api={fetchApi(path,options){calls.push({path,options});return new Promise(resolve=>pending.push(resolve));}};
const view=shotMediaView();
const first=view.render(createShot({media:[{context_id:"v",role:"context"}]}),[entries[1]],api);
const second=view.render(createShot({media:[{context_id:"v",role:"context"}]}),[entries[1]],api);
assert.equal(calls.length,1,"shared file needs one request");
assert.match(first.all().find(element=>element.className==="ng-shot-preview-status").textContent,/Loading/);
pending.shift()({json:async()=>({ok:true,thumbnail:"data:image/jpeg;base64,first",frame_index:0})});
await new Promise(resolve=>setTimeout(resolve,0));
for(const root of [first,second]){
  const image=root.all().find(element=>element.tag==="img");assert.equal(image.src,"data:image/jpeg;base64,first");assert.equal(image.hidden,false);
  assert.match(image.alt,/First input video frame/);
}
const empty=view.render(createShot({media:[{context_id:"empty",role:"context"}]}),[context("empty","image","image",{image:""})],api);
assert.match(empty.all().find(element=>element.className==="ng-shot-preview-status").textContent,/No input file/);
assert.equal(calls.length,1);
const broken=view.render(createShot({media:[{context_id:"broken",role:"context"}]}),[context("broken","video")],api);
pending.shift()({json:async()=>({ok:false,error:"The file is missing"})});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(broken.all().find(element=>element.tag==="img").hidden,true);
assert.match(broken.all().find(element=>element.className==="ng-shot-preview-status").textContent,/missing/);
assert.ok(broken.all().some(element=>element.dataset.kind==="video"),"type remains visible after failure");
view.refresh();
view.render(createShot({media:[{context_id:"v",role:"context"}]}),[entries[1]],api);
assert.equal(calls.length,3,"refresh retries the same file");
view.dispose();assert.equal(calls[2].options.signal.aborted,true,"removal aborts pending preview I/O");
pending.shift()({json:async()=>({ok:true,thumbnail:"data:image/jpeg;base64,late"})});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(writeStory([readStory(original).shots[0]]),original);

const racePending=[],raceCalls=[],raceView=shotMediaView();
const raceApi={fetchApi(path,options){raceCalls.push({path,options});return new Promise(resolve=>racePending.push(resolve));}};
const bound=createShot({media:[{context_id:"v",role:"context"}]});
const retired=raceView.render(bound,[entries[1]],raceApi);
const replacement={...entries[1],widgets:{...entries[1].widgets,video:"replacement.mp4"}};
raceView.prune([replacement]);
const current=raceView.render(bound,[replacement],raceApi);
assert.equal(raceCalls[0].options.signal.aborted,true,"changing a file cancels its old request");
racePending.shift()({json:async()=>({ok:true,thumbnail:"data:image/jpeg;base64,obsolete"})});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(retired.all().find(element=>element.tag==="img").hidden,true,"a late old response cannot update a retired preview");
assert.equal(current.all().find(element=>element.tag==="img").hidden,true,"the replacement waits for its own file");
racePending.shift()({json:async()=>({ok:true,thumbnail:"data:image/jpeg;base64,replacement"})});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(current.all().find(element=>element.tag==="img").src,"data:image/jpeg;base64,replacement");
raceView.dispose();

const node={properties:{ng_selected_shot_id:shot.id},widgets:[{name:"shots",value:original},{name:"project_seconds",value:8}],graph:{change(){}}};
const editor=storyEditor(node),requests=[];
const liveApi={fetchApi(path,options){requests.push({path,options});return Promise.resolve({json:async()=>({ok:true,thumbnail:"data:image/jpeg;base64,live"})});}};
editor.contexts(entries,liveApi);await new Promise(resolve=>setTimeout(resolve,0));
function labelled(label){return editor.root.all().find(element=>element.attributes["aria-label"]===label);}
const action=labelled("Shot 1 action and dialogue");document.activeElement=action;
action.value="My edited action mentions @v.";action.oninput();
assert.equal(labelled("Shot 1 action and dialogue"),action,"updating marks must retain the focused text control");
assert.equal(readStory(node.widgets[0].value).shots[0].text,action.value);
const changed=entries.map(entry=>entry.widgets.context_id==="a"?{...entry,widgets:{...entry.widgets,name:"Renamed",color:"#abcdef"}}:entry);
editor.contexts(changed,liveApi);
assert.equal(labelled("Shot 1 action and dialogue"),action,"context refresh while typing must preserve focus");
assert.ok(editor.root.all().some(element=>element.dataset.contextId==="a"&&element.title.includes("Renamed")&&element.style.color==="#abcdef"));
const imageRequest=requests.find(call=>call.path.includes("source=a.file"));
editor.contexts(changed.filter(entry=>entry.widgets.context_id!=="a"),liveApi);
assert.equal(imageRequest.options.signal.aborted,true,"disconnecting a source retires its preview");
assert.ok(editor.root.all().some(element=>element.dataset.kind==="missing"&&element.dataset.contextId==="a"));
const saved=readStory(node.widgets[0].value).shots[0];
assert.deepEqual(saved.media,readStory(original).shots[0].media);assert.deepEqual(saved.spoken,readStory(original).shots[0].spoken);
assert.equal(node.properties.ng_selected_shot_id,shot.id);
assert.doesNotMatch(node.widgets[0].value,/data:image/,"preview bytes must never enter workflow data");
editor.dispose();assert.ok(requests.every(call=>call.options.signal.aborted));document.activeElement=null;
console.log("ng shot media: mixed types, explicit audio kinds, identity, mentions, fallback, sharing, refresh and cleanup passed");
