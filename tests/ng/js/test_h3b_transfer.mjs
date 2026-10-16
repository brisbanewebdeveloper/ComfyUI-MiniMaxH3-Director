import assert from "node:assert/strict";
import { boardJobs } from "../../../js/ng/h3b_jobs.js";
import { newBoard } from "../../../js/ng/h3b_model.js";

const widget = (name, value = "") => ({ name, value, options: { values: [] } });
const card = (name, file, type = "NGContextImage") => ({ comfyClass: type,
  widgets: [widget("name", name), widget("image", file), widget("context_id", `old-${name}`)] });
const connector = { id: 1, comfyClass: "NGContextConnector",
  inputs: Array.from({length:8}, (_,n) => ({name:`context_image.${n}`, link:null})) };
const prior = { format:"h3-director-shots", schema_version:1, shots:[],
  audio_lanes:[{id:"song", clips:[]}], control_lanes:[{id:"control", clips:[]}] };
const director = { id:2, comfyClass:"NGH3Director", inputs:[{name:"context",link:5}],
  widgets:[widget("shots",JSON.stringify(prior)),widget("project_seconds",10),widget("idea","Keep my idea")] };
const graph = { _nodes:[connector,director,card("Storyboard","old-sheet.png"),card("Panel 1","", "NGContextText")],
  links:{5:{origin_id:1}},getNodeById(id){return this._nodes.find(n=>n.id===id);},
  add(node){node.id=this._nodes.length+1;this._nodes.push(node);},setDirtyCanvas(){},change(){} };
director.graph=graph;
globalThis.document={dispatchEvent(){}};
globalThis.CustomEvent=class { constructor(type){this.type=type;} };
globalThis.window={confirm:()=>true,LiteGraph:{createNode(type){
  return {comfyClass:type,widgets:["name","image","description","content","usage","content_roles","usage_roles","context_id"].map(n=>widget(n)),
    connect(_out,target,slot){target.inputs[slot].link=this.id;}};
}}};
const board=newBoard(); board.panels=board.panels.slice(0,1); board.panels[0].last_frame=true;
const S={board,busy:"",notice:null};
const jobs=boardJobs({S,node:{id:26,pos:[0,0],size:[1300,900]},app:{graph},api:{},pictures:{},change(){},render(){},flash(){},
  renderFiles:async()=>JSON.stringify({sheet:"new-sheet.png",panels:["new-panel.png"]}),connector:()=>connector,contexts:()=>[]});
await jobs.sendToDirector();
assert.equal(S.notice.error,false);
const created=graph._nodes.slice(4), doc=JSON.parse(director.widgets[0].value);
const read=(node,name)=>node.widgets.find(w=>w.name===name)?.value;
assert.deepEqual(created.map(n=>read(n,"name")),["Storyboard 2","Panel 1 2"]);
assert.deepEqual(doc.shots[0].media.map(m=>m.role),["storyboard","last_frame"]);
assert.equal(doc.shots[0].media[1].context_id,read(created[1],"context_id"));
assert.equal(read(created[1],"usage"),"last_frame");
assert.deepEqual(doc.audio_lanes,prior.audio_lanes);
assert.deepEqual(doc.control_lanes,prior.control_lanes);
assert.equal(read(director,"idea"),"Keep my idea");
assert.equal(read(director,"project_seconds"),2.5);
assert.equal(read(graph._nodes[2],"name"),"Storyboard");
assert.equal(read(graph._nodes[3],"name"),"Panel 1");
const firstId=read(created[1],"context_id");
board.panels[0].first_frame=true;
await jobs.sendToDirector();
assert.equal(graph._nodes.length,6,"sending again reuses generated cards");
assert.equal(read(created[1],"context_id"),firstId);
assert.deepEqual(JSON.parse(read(director,"shots")).shots[0].media.map(m=>m.role),["storyboard","first_frame","last_frame"]);
assert.equal(new Set(graph._nodes.filter(n=>n.comfyClass.startsWith("NGContext") && n!==connector).map(n=>read(n,"name").toLowerCase())).size,4);
console.log("h3b transfer ok");
