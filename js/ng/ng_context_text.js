import { element, values, applyValues } from "./ng_widgets.js";
import { ensureContextTextStyle } from "./ng_context_text_style.js";
import { control, section } from "./ng_editor_fields.js";
import { icon } from "./ng_icons.js";
import { CONTENT } from "./ng_context_controls.js";
import { relatedContexts } from "./ng_read.js";
import { renameReferences, renderReferences } from "./ng_references.js";

// The reference card counts "298 / 2000" above the editor. That is guidance, not a cap: the note is
// free text for the prompt builder, so an over-limit count turns red instead of blocking the input.
const CHARACTER_LIMIT = 2000;

// One icon and one colour per kind, used by the Quick Insert row AND by the same bracket token in the
// editor, so the two places are recognisably the same thing. The names come from CONTENT.text because
// that list is what the prompt builder resolves; the decorative `[camera_rule]`/`[atmosphere]` names on
// the mock-up describe no field and are deliberately not introduced.
const KINDS = {
  character: { icon: "user", tone: "rose" },
  environment: { icon: "map", tone: "green" },
  outfit: { icon: "shirt", tone: "blue" },
  camera_motion: { icon: "film", tone: "cyan" },
  lighting: { icon: "sun", tone: "orange" },
  action: { icon: "sparkle", tone: "red" },
  dialogue: { icon: "mic", tone: "purple" },
  rules: { icon: "check", tone: "teal" },
};

const TEMPLATES = {
  "Cinematic Rules": { icon: "clapper", text: "Keep camera movement slow and physical. Avoid rapid cuts. Maintain cool industrial lighting." },
  "Character Description": { icon: "user", text: "@Character: describe identity, appearance and behaviour here." },
  "World Lore": { icon: "globe", text: "Describe the location, world rules and atmosphere here." },
  "Style Instructions": { icon: "palette", text: "Describe the visual style, colour palette and texture here." },
  "Camera Rules": { icon: "film", text: "Describe framing, camera movement and lens here." },
  "Dialogue Rules": { icon: "mic", text: "@Character says: write the exact dialogue here." },
  "Scene Constraints": { icon: "check", text: "Describe what must stay consistent and what must not happen here." },
};

export function textEditor(node) {
  ensureContextTextStyle();
  const root=element("div","ng-text-workspace"), editor=section("☷ Text Content","ng-text-editor-panel"), field=control(node,"text","Context text",{multiline:true});
  const count=element("span","ng-text-count"), preview=element("pre","ng-editor-highlight"),overlay=element("div","ng-editor-overlay");
  // Both live inside the editor frame: the count reads as part of the text box, and the grow button has
  // to sit above the textarea to stay clickable, so it shares that stacking context.
  const grow=element("button","ng-text-grow","⤢");
  grow.type="button";grow.title="Bigger editor";grow.setAttribute("aria-label","Bigger editor");grow.setAttribute("aria-pressed","false");
  grow.onclick=()=>{const tall=overlay.classList.toggle("ng-text-tall");grow.setAttribute("aria-pressed",String(tall));};
  overlay.append(preview,field.field,count,grow);field.label.append(overlay);editor.append(field.label);
  field.field.classList.add("ng-highlight-input");field.field.spellcheck=false;
  field.field.onscroll=()=>{preview.scrollTop=field.field.scrollTop;preview.scrollLeft=field.field.scrollLeft;};
  const quick=section("★ Quick Insert","ng-quick-panel");
  for(const [key,label] of CONTENT.text) {
    const kind=KINDS[key]||{};
    const button=element("button","ng-quick-insert");button.dataset.kind=key;
    if(kind.tone)button.dataset.tone=kind.tone;
    button.append(icon(kind.icon||"plus","ng-quick-icon"),element("span","ng-quick-label",label));
    button.onclick=()=>{const text=field.field, position=text.selectionStart??text.value.length;
      const insert=`[${key}]`;applyValues(node,{text:text.value.slice(0,position)+insert+text.value.slice(text.selectionEnd??position)});
      text.focus();text.setSelectionRange(position,position+insert.length);node.graph?.change();};quick.append(button);
  }
  const templates=section("⚙ Text Templates","ng-template-panel"), row=element("div","ng-template-row"),
    choices=element("select"), use=element("button","ng-template-use");
  choices.setAttribute("aria-label","Text template");for(const name of Object.keys(TEMPLATES))choices.append(element("option","",name));
  // The button carries the icon of the template that is currently chosen, so it previews what Use
  // Template will actually write instead of a neutral glyph. The element is held directly rather than
  // looked up again, so swapping it never depends on a query the surrounding panel has to answer.
  const useIcon=icon(TEMPLATES[Object.keys(TEMPLATES)[0]].icon,"ng-template-icon");
  const syncUseIcon=()=>{useIcon.innerHTML=icon(TEMPLATES[choices.value].icon,"ng-template-icon").innerHTML;};
  use.append(useIcon,element("span","","Use Template"));
  const applyTemplate=()=>{applyValues(node,{text:TEMPLATES[choices.value].text});node.graph?.change();};
  choices.onchange=syncUseIcon;
  use.onclick=applyTemplate;
  row.append(choices,use);templates.append(row);
  const examples=section("☀ Example Templates","ng-example-panel");
  for(const [name,template] of Object.entries(TEMPLATES)){
    const button=element("button","ng-text-example");
    button.append(icon(template.icon,"ng-example-icon"),element("span","ng-example-label",name));
    // A tile stands for one template: it selects it and applies it, which is the one thing the user
    // wants from it. Going through applyTemplate instead of a synthetic click keeps both paths identical.
    button.onclick=()=>{choices.value=name;syncUseIcon();applyTemplate();};examples.append(button);}
  const main=element("div","ng-text-main"),sidebar=element("div","ng-text-sidebar");main.append(editor,templates,examples);root.append(main,quick,sidebar);
  function sync() {
    const entries=relatedContexts(node),previous=node.properties?.ng_context_names||{},current=values(node).text||"";
    const renamed=renameReferences(current,previous,entries);
    node.properties||={};
    node.properties.ng_context_names=Object.fromEntries(entries.filter(entry=>entry.widgets.context_id&&entry.widgets.name)
      .map(entry=>[entry.widgets.context_id,entry.widgets.name]));
    if(renamed!==current)applyValues(node,{text:renamed});
    field.sync();const text=values(node).text||"";
    count.textContent=`${text.length} / ${CHARACTER_LIMIT}`;
    count.dataset.over=String(text.length>CHARACTER_LIMIT);
    preview.replaceChildren();
    const parts=text.split(/(\[[^\]\n]+\])/u);
    for(const part of parts){const placeholder=/^\[/.test(part);
      const span=element("span",placeholder?"ng-template-placeholder":"");
      if(placeholder){span.textContent=part;span.title="Template placeholder · replace with a description or @Context.";
        // A known kind keeps its own colour, the same tone as its Quick Insert row. An unknown bracket
        // stays neutral rather than being assigned a colour that would claim a meaning it does not have.
        const key=part.slice(1,-1).trim();
        if(KINDS[key]){span.dataset.kind=key;span.dataset.tone=KINDS[key].tone;}}
      else renderReferences(span,part,entries,element);preview.append(span);}
    preview.append(element("span","","\n"));
    preview.title="Template placeholders in brackets must be replaced with your own descriptions. @Name refers to a connected context.";
  }
  sync();return {root,sidebar,sync};
}
