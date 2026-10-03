import assert from "node:assert/strict";
import { readStory, writeStory, createShot, moveShot, renameStoryReferences, sceneApplyProblem } from "../../../js/ng/ng_story_model.js";
import { shotFields } from "../../../js/ng/ng_shot_fields.js";

class Element {
  constructor(tag) { this.tag=tag; this.children=[]; this.attributes={}; this.value=""; }
  append(...children) { this.children.push(...children); }
  setAttribute(name,value) { this.attributes[name]=value; }
  all() { return [this,...this.children.flatMap(child=>child.all())]; }
}
globalThis.document={createElement:tag=>new Element(tag)};
const entry={media:"image",widgets:{context_id:"ctx-stable",name:"Alice"}};
const old=readStory("0-4: @Alice walks.\n@Alice says: Original words.\n4-10: Sit.");
assert.equal(old.error,"");
assert.deepEqual(old.shots.map(shot=>shot.id),["legacy-shot-1","legacy-shot-2"]);
const migrated=readStory(writeStory(old.shots));
assert.deepEqual(migrated.shots,old.shots,"migration preserves multiline text and IDs");
const shot=createShot({start:0,end:4,text:"My words"});
const identity=shot.id;
assert.notEqual(identity,createShot().id);
assert.equal(moveShot(shot,2,"move",10).id,identity);
let writes=0; let panel;
function rebuild(){ panel=shotFields(shot,0,[entry],()=>writes++,rebuild); }
function label(name){return panel.all().find(element=>element.attributes["aria-label"]===name);}
rebuild();
let picker=label("Shot 1 context"); picker.value="ctx-stable";picker.onchange();
assert.deepEqual(shot.media,[{schema_version:1,context_id:"ctx-stable",role:"context"}]);
assert.equal(shot.text,"My words","assignment must not rewrite user prose");
picker=label("Shot 1 context");picker.value="ctx-stable";picker.onchange();
assert.equal(shot.media.length,1,"same context is not assigned twice");
label("Add shot 1 spoken line").onclick();
let field=label("Shot 1 dialogue 1 text");field.value="Original spoken words";field.oninput();
field=label("Shot 1 dialogue 1 speaker");field.value="ctx-stable";field.onchange();
field=label("Protect shot 1 text from AI");field.checked=true;field.onchange();
assert.deepEqual(shot.locked_fields,["text"]);
assert.match(sceneApplyProblem(writeStory([shot])),/cannot preserve/);
shot.text="Manual edit still works";
assert.equal(readStory(writeStory([shot])).shots[0].text,"Manual edit still works");
shot.text="@Alice walks.";shot.spoken[0].text="@Alice is literal dialogue";
shot.draft={text:"Proposal remains separate"};
const renamed=renameStoryReferences(writeStory([shot]),{"ctx-stable":"Alice"},[{...entry,widgets:{...entry.widgets,name:"Renamed"}}]);
const restored=readStory(renamed).shots[0];
assert.equal(restored.id,identity);assert.equal(restored.media[0].context_id,"ctx-stable");
assert.equal(restored.text,"@Renamed walks.");
assert.equal(restored.spoken[0].text,"@Alice is literal dialogue","spoken words are never context-renamed");
assert.deepEqual(restored.draft,{text:"Proposal remains separate"});
assert.deepEqual(readStory(writeStory([old.shots[1],restored])).shots.map(shot=>shot.id),["legacy-shot-2",identity],"reorder retains identity");
const malformed=["{bad",JSON.stringify({format:"h3-director-shots",schema_version:2,shots:[]}),writeStory([shot,shot]),writeStory([{...shot,media:{}}])];
for(const text of malformed){assert.ok(readStory(text).error);assert.equal(renameStoryReferences(text,{},[]),text);}
assert.equal(sceneApplyProblem("0-5: Simple manual text."),"");
label("Remove shot 1 media 1").onclick();assert.equal(shot.media.length,0);
assert.ok(writes>=5,"actual editor controls commit changes");
console.log("ng shots: migration, IDs, mouse controls, bindings, dialogue, protection, rename, drafts and malformed data passed");
