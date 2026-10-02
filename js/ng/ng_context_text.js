import { element, values, applyValues } from "./ng_widgets.js";
import { control, section } from "./ng_editor_fields.js";
import { CONTENT } from "./ng_context_controls.js";

const TEMPLATES={
  "Cinematic Rules":"Keep camera movement slow and physical. Avoid rapid cuts. Maintain consistent lighting and spatial continuity.",
  "Character Description":"@Character: describe identity, appearance and behaviour here.",
  "World Lore":"Describe the location, world rules and atmosphere here.",
  "Style Instructions":"Describe the visual style, colour palette and texture here.",
  "Camera Rules":"Describe framing, camera movement and lens here.",
  "Dialogue Rules":"@Character says: write the exact dialogue here.",
  "Scene Constraints":"Describe what must stay consistent and what must not happen here.",
};

export function textEditor(node) {
  const root=element("div","ng-text-workspace"), editor=section("☷ Text Content"), field=control(node,"text","Context text",{multiline:true});
  const count=element("span","ng-text-count"), preview=element("pre","ng-text-highlight");editor.append(field.label,count,preview);
  const quick=section("★ Quick Insert");
  for(const [key,label] of CONTENT.text) {
    const button=element("button","ng-quick-insert",label);button.dataset.kind=key;
    button.onclick=()=>{const text=field.field, position=text.selectionStart??text.value.length;
      const insert=`[${key}]`;applyValues(node,{text:text.value.slice(0,position)+insert+text.value.slice(text.selectionEnd??position)});
      text.focus();text.setSelectionRange(position,position+insert.length);node.graph?.change();};quick.append(button);
  }
  const templates=section("⚙ Text Templates"), choices=element("select"), use=element("button","","Use Template");
  choices.setAttribute("aria-label","Text template");for(const name of Object.keys(TEMPLATES))choices.append(element("option","",name));
  use.onclick=()=>{applyValues(node,{text:TEMPLATES[choices.value]});node.graph?.change();};templates.append(choices,use);
  const examples=section("☀ Example Templates");for(const name of Object.keys(TEMPLATES)){
    const button=element("button","",name);button.onclick=()=>{choices.value=name;use.click();};examples.append(button);}
  root.append(editor,quick,templates,examples);
  function sync() {
    field.sync();const text=values(node).text||"";count.textContent=`${text.length} characters`;preview.replaceChildren();
    const parts=text.split(/(@[\p{L}\p{N}_-]+|\[[^\]\n]+\])/u);
    for(const part of parts){const span=element("span",/^@|^\[/.test(part)?"ng-text-token":"",part);preview.append(span);}
    preview.title="Template placeholders in brackets must be replaced with your own descriptions. @Name refers to a connected context.";
  }
  sync();return {root,sync};
}
