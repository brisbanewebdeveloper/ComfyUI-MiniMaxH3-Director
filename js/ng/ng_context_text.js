import { element, values, applyValues } from "./ng_widgets.js";
import { ensureContextTextStyle } from "./ng_context_text_style.js";
import { control, section } from "./ng_editor_fields.js";
import { icon } from "./ng_icons.js";
import { CONTENT } from "./ng_context_controls.js";
import { relatedContexts, contextProvider } from "./ng_read.js";
import { aiAction } from "./ng_ai_request.js";
import { renameReferences, renderReferences } from "./ng_references.js";

// The browser handle is read when the button runs, not while this module loads. ComfyUI's api and
// app are published before any card is built, but binding them at import time also froze whatever
// existed at that moment, which is a value that can be replaced by a later plugin or a test stand-in.
const comfy=()=>window.comfyAPI;

// The reference card counts "298 / 2000" above the editor. That is guidance, not a cap: the note is
// free text for the prompt builder, so an over-limit count turns red instead of blocking the input.
const CHARACTER_LIMIT = 2000;

// One icon and one colour per kind, used by the Quick Insert row AND by the same bracket token in the
// editor, so the two places are recognisably the same thing. The names come from CONTENT.text, which
// is the list CONTENT_BY_MEDIA["text"] in ng/core/context.py accepts - a token naming anything else
// would be reported as an unknown content kind.
const KINDS = {
  shot: { icon: "clapper", tone: "rose" },
  dialogue: { icon: "mic", tone: "purple" },
  voice: { icon: "user", tone: "orange" },
  ambience: { icon: "globe", tone: "teal" },
  music: { icon: "music", tone: "cyan" },
  sound_effect: { icon: "sparkle", tone: "red" },
  camera_motion: { icon: "film", tone: "blue" },
  character: { icon: "user", tone: "pink" },
  outfit: { icon: "shirt", tone: "indigo" },
  environment: { icon: "map", tone: "green" },
  lighting: { icon: "sun", tone: "amber" },
  style: { icon: "palette", tone: "lime" },
  rules: { icon: "check", tone: "slate" },
  action: { icon: "sparkle", tone: "rose" },
};

// The two blocks the AI button can write, and the length the note is timed for. Both ranges are the
// model's own: the prompt-writing guide states 4-15 seconds, and the enhance node's two presets are
// the shape the compiled prompt actually expects.
const PRESETS = [["global", "Scene + style (one block)"], ["storyboard", "Storyboard (shots + cuts)"]];
const SECONDS = { min: 4, max: 15, step: 1, value: 8 };

export function textEditor(node) {
  ensureContextTextStyle();
  const root=element("div","ng-text-workspace"), editor=section("☷ Text Content","ng-text-editor-panel"), field=control(node,"text","Text content",{multiline:true});
  // The panel heading above already reads "Text Content". A second label saying "Context text"
  // directly under it only repeated the same two words one row lower, so the element is kept for
  // the screen reader and the aria-label, and is not drawn.
  field.label.classList.add("ng-text-unlabelled");
  const count=element("span","ng-text-count"), highlight=element("pre","ng-editor-highlight"),overlay=element("div","ng-editor-overlay");
  // Both live inside the editor frame: the count reads as part of the text box, and the grow button has
  // to sit above the textarea to stay clickable, so it shares that stacking context.
  const grow=element("button","ng-text-grow","⤢");
  grow.type="button";grow.title="Bigger editor";grow.setAttribute("aria-label","Bigger editor");grow.setAttribute("aria-pressed","false");
  grow.onclick=()=>{const tall=overlay.classList.toggle("ng-text-tall");grow.setAttribute("aria-pressed",String(tall));};
  overlay.append(highlight,field.field,count,grow);field.label.append(overlay);editor.append(field.label);
  field.field.classList.add("ng-highlight-input");field.field.spellcheck=false;
  field.field.onscroll=()=>{highlight.scrollTop=field.field.scrollTop;highlight.scrollLeft=field.field.scrollLeft;};
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
  // One button, one job: rewrite the note above into the English block H3 expects. It deliberately
  // does not touch the text field. The note is the user's own words, possibly in any language, and
  // a rewrite is a proposal - overwriting the only copy the moment a button is pressed is how a
  // five-line note gets lost. So the answer arrives in a box the user reads first.
  const build=section("✦ Build H3 Prompt","ng-build-panel"), options=element("div","ng-build-row"),
    preset=element("select"), seconds=element("input"), go=element("button","ng-build-go"),
    answer=element("textarea","ng-build-answer"), hint=element("small","ng-muted"), cancel=element("button","","Cancel");
  preset.setAttribute("aria-label","Prompt block");
  for(const [value,label] of PRESETS){const option=element("option","",label);option.value=value;preset.append(option);}
  preset.value=PRESETS[0][0];
  seconds.type="number";seconds.min=String(SECONDS.min);seconds.max=String(SECONDS.max);
  seconds.step=String(SECONDS.step);seconds.value=String(SECONDS.value);seconds.setAttribute("aria-label","Video length in seconds");
  go.append(icon("sparkle","ng-build-icon"),element("span","","Build prompt"));
  go.onclick=async()=>{
    const provider=contextProvider(node);
    if(!provider){hint.textContent="AI off · connect H3 AI Loader directly or through the Connector.";return;}
    // The note is read here rather than from the widget, so what is sent is exactly what is on
    // screen - including a rename the user has typed but not committed.
    const note=field.field.value.trim();
    if(!note){hint.textContent="Write the scene first, in any language.";answer.value="";sync();return;}
    busy=true;controller=new AbortController();hint.textContent="";answer.value="";sync();
    try{
      const secondsValue=Math.min(SECONDS.max,Math.max(SECONDS.min,Number(seconds.value)||SECONDS.value));
      seconds.value=String(secondsValue);
      const data=await aiAction(comfy().app,comfy().api,"prompt",{note,seconds:secondsValue,preset:preset.value,provider},controller.signal);
      answer.value=data.suggestion?.prompt??"";
      answer.hidden=!answer.value;
      // A finished build lands in the AI version and the switch flips to it, so the prompt is read
      // in the editor straight away. The note is stored first, which is what makes going back safe.
      if(answer.value){node.properties||={};
        // Only the note side may overwrite the stored note. After the first build the editor shows
        // the AI version, so a second build would otherwise save that over the note and the switch
        // would have nothing left to go back to - the one thing it exists for.
        if(mode!=="ai")node.properties.ng_text_note=note;
        node.properties.ng_text_ai=answer.value;
        mode="ai";applyValues(node,{text:answer.value});node.graph?.change();}
    }catch(error){hint.textContent=error.message;answer.value="";answer.hidden=true;}
    finally{busy=false;controller=null;sync();}
  };
  cancel.onclick=()=>controller?.abort();
  // One switch instead of "Use this prompt" and "Restore my text". Both buttons moved the note back
  // and forth, could disagree with each other, and "use" overwrote the note it replaced. Here both
  // versions are kept - the note in ng_text_note, the built prompt in ng_text_ai - and the switch
  // only decides which one the editor shows and the Director reads. Going back is always possible.
  const ownText=()=>String(node.properties?.ng_text_note??values(node).text??""),
    aiText=()=>String(node.properties?.ng_text_ai??"");
  let mode=aiText()?"ai":"note";
  const switcher=element("div","ng-text-switch"),
    noteSide=element("button","ng-text-switch-btn","✎ My note"), aiSide=element("button","ng-text-switch-btn","✨ AI prompt");
  noteSide.type=aiSide.type="button";
  noteSide.title="Your own note";aiSide.title="The prompt the AI built from it";
  // Saving before switching is what makes the switch lossless: whatever is on screen goes back to the
  // version it belongs to, so edits made in either view survive a trip to the other one.
  function showMode(next){
    const current=field.field.value;
    node.properties||={};
    node.properties[mode==="ai"?"ng_text_ai":"ng_text_note"]=current;
    mode=next;
    const shown=mode==="ai"?aiText():ownText();
    if(shown!==current){applyValues(node,{text:shown});node.graph?.change();}
    // The AI prompt is the model's wording, not a note the user is drafting, so it is shown
    // read-only. Switching to My note hands editing back rather than writing over the answer.
    field.field.readOnly=mode==="ai";
    sync();
  }
  noteSide.onclick=()=>showMode("note");aiSide.onclick=()=>showMode("ai");
  switcher.append(noteSide,aiSide);
  // The Build panel holds only the three settings the request is made with; its button lives here so
  // the whole request stays in one row.
  options.append(preset,seconds,go,cancel);build.append(options,hint);
  // The finished prompt is shown under the note, not inside the Build panel: the panel above holds
  // the three settings the request is made with, and the answer is the one thing the user reads
  // next to the sentence it will replace.
  const previewPanel=section("✦ Preview","ng-text-preview-panel"), analysisHost=element("div","ng-text-preview-analysis"),
    placeholder=element("small","ng-muted","The result appears here. Analyze the note, or build a prompt from it.");
  previewPanel.append(switcher,analysisHost,answer,placeholder);
  let busy=false,controller=null;
  // The answer is read defensively: a rebuilt panel can sync once before its textarea exists, and a
  // card that cannot render its own button state is worse than one missing an update.
  const answered=()=>String(answer.value??"").trim();
  function syncBuild() {
    const provider=contextProvider(node);
    go.disabled=busy||!provider;cancel.hidden=!busy;
    answer.hidden=!answered();
    // The AI view is only offered once there is something to switch to. Before the first build it
    // would be an empty text field pretending to be an answer.
    aiSide.disabled=!aiText()||busy;
    switcher.dataset.mode=mode;
    noteSide.setAttribute("aria-pressed",String(mode==="note"));aiSide.setAttribute("aria-pressed",String(mode==="ai"));
    // The hint only earns its row while a request is in flight or has just failed; otherwise the
    // preview window shows the answer or the placeholder, never both.
    hint.hidden=!hint.textContent;
    placeholder.hidden=busy||!!hint.textContent||!!answered()||!!analysisHost.textContent;
  }
  // Left column: the note, and directly under it the finished prompt. Right column, top to bottom:
  // Preset, Build H3 Prompt, Quick Insert - the order the card is read in.
  const main=element("div","ng-text-main"),sidebar=element("div","ng-text-sidebar"),presetSlot=element("div","ng-text-preset-slot");
  main.append(editor,previewPanel);sidebar.append(presetSlot,build,quick);root.append(main,sidebar);
  // Starts on the AI view only if a previous build is still stored, matching how the switch reads.
  field.field.readOnly=mode==="ai";
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
    highlight.replaceChildren();
    const parts=text.split(/(\[[^\]\n]+\])/u);
    for(const part of parts){const placeholder=/^\[/.test(part);
      const span=element("span",placeholder?"ng-template-placeholder":"");
      if(placeholder){span.textContent=part;span.title="Template placeholder · replace with a description or @Context.";
        // A known kind keeps its own colour, the same tone as its Quick Insert row. An unknown bracket
        // stays neutral rather than being assigned a colour that would claim a meaning it does not have.
        const key=part.slice(1,-1).trim();
        if(KINDS[key]){span.dataset.kind=key;span.dataset.tone=KINDS[key].tone;}}
      else renderReferences(span,part,entries,element);highlight.append(span);}
    highlight.append(element("span","","\n"));
    highlight.title="A bracket marks a part of the video. Write what belongs there, or let Build prompt fill it in. @Name refers to a connected context.";
    // The build panel reads the same state this function writes, so it is refreshed with it rather
    // than only when its own buttons are clicked - connecting an AI provider has to enable the
    // button, and that happens without any interaction here.
    syncBuild();
  }
  sync();return {root,sidebar,presetSlot,analysisHost,sync};
}
