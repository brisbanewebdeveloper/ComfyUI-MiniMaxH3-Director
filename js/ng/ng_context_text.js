import { element, values, applyValues } from "./ng_widgets.js";
import { control, section } from "./ng_editor_fields.js";
import { CONTENT } from "./ng_context_controls.js";
import { relatedContexts } from "./ng_read.js";
import { renameReferences, renderReferences } from "./ng_references.js";

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
  const count=element("span","ng-text-count"), preview=element("pre","ng-editor-highlight"),overlay=element("div","ng-editor-overlay");
  overlay.append(preview,field.field);field.label.append(overlay);editor.append(field.label,count);
  field.field.classList.add("ng-highlight-input");field.field.spellcheck=false;
  field.field.onscroll=()=>{preview.scrollTop=field.field.scrollTop;preview.scrollLeft=field.field.scrollLeft;};
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
  const main=element("div","ng-text-main"),sidebar=element("div","ng-text-sidebar");main.append(editor,templates,examples);root.append(main,quick,sidebar);
  function sync() {
    const entries=relatedContexts(node),previous=node.properties?.ng_context_names||{},current=values(node).text||"";
    const renamed=renameReferences(current,previous,entries);
    node.properties||={};
    node.properties.ng_context_names=Object.fromEntries(entries.filter(entry=>entry.widgets.context_id&&entry.widgets.name)
      .map(entry=>[entry.widgets.context_id,entry.widgets.name]));
    if(renamed!==current)applyValues(node,{text:renamed});
    field.sync();const text=values(node).text||"";count.textContent=`${text.length} characters`;preview.replaceChildren();
    const parts=text.split(/(\[[^\]\n]+\])/u);
    for(const part of parts){const span=element("span",/^\[/.test(part)?"ng-template-placeholder":"");
      if(/^\[/.test(part)){span.textContent=part;span.title="Template placeholder · replace with a description or @Context.";}
      else renderReferences(span,part,entries,element);preview.append(span);}
    preview.append(element("span","","\n"));
    preview.title="Template placeholders in brackets must be replaced with your own descriptions. @Name refers to a connected context.";
  }
  sync();return {root,sidebar,sync};
}
