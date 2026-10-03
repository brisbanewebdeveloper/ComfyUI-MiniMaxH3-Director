import { element, applyValues, values } from "./ng_widgets.js";
import { section, control } from "./ng_editor_fields.js";
import { readStory, writeStory, moveShot } from "./ng_story_model.js";
import { mediaURL } from "./ng_media_editor.js";
import { renderReferences } from "./ng_references.js";
import { contextColor } from "./ng_identity.js";

export function storyEditor(node) {
  const root = section("Scene", "ng-story-section");
  const cards = element("div", "ng-shot-cards");
  const timeline = element("div", "ng-story-timeline");
  const chunks = element("div", "ng-generation-track");
  const ruler=element("div","ng-timeline-ruler");
  const raw = control(node, "shots", "Original shot text", { multiline: true });
  const fallback = element("details", "ng-raw-shots");
  fallback.append(element("summary", "", "Edit shot text"), raw.label);
  const add = element("button", "ng-button", "+ Shot");
  const reset = element("button", "ng-button ng-secondary", "Use idea as one scene");
  const tools = element("div", "ng-actions"); tools.append(add, reset);
  root.append(cards, tools, element("h4", "ng-track-label", "Story · drag a shot or its edges"),ruler, timeline,
              element("h4", "ng-track-label", "Generation · planned render chunks"), chunks, fallback);
  let shots = [], writing = false, entries = [], api = null;
  function commit() {
    writing = true; applyValues(node, { shots: writeStory(shots) }); writing = false;
    node.graph?.change();
  }
  function drawTimeline() {
    timeline.replaceChildren();
    const duration = Number(values(node).project_seconds);
    ruler.replaceChildren();for(let tick=0;tick<=5;tick++)ruler.append(element("span","",`${(duration*tick/5).toFixed(1)} s`));
    shots.forEach((shot, index) => {
      const bar = element("div", "ng-story-block", `${index + 1}`);
      bar.title = `Shot ${index + 1}: ${shot.start.toFixed(2)}–${shot.end.toFixed(2)} s`;
      bar.style.left = `${shot.start / duration * 100}%`;
      bar.style.width = `${(shot.end - shot.start) / duration * 100}%`;
      const entry=entries.find((entry)=>shot.text.includes("@"+entry.widgets.name));if(entry)bar.style.borderColor=contextColor(entry);
      for (const part of ["start", "end"]) {
        const handle = element("span", "ng-time-handle ng-time-" + part);
        handle.dataset.part = part; bar.append(handle);
      }
      bar.onpointerdown = (event) => {
        event.stopPropagation(); event.preventDefault();
        const start = event.clientX, original = { ...shot }, part = event.target.dataset.part || "move";
        bar.setPointerCapture(event.pointerId);
        bar.onpointermove = (move) => {
          shots[index] = moveShot(original, (move.clientX - start) / timeline.getBoundingClientRect().width * duration, part, duration);
          bar.style.left = `${shots[index].start / duration * 100}%`;
          bar.style.width = `${(shots[index].end - shots[index].start) / duration * 100}%`;
        };
        bar.onpointerup = () => { bar.onpointermove = null; commit(); rebuild(); };
        bar.onpointercancel = () => { shots[index] = original; rebuild(); };
      };
      timeline.append(bar);
    });
  }
  function shotCard(shot, index) {
    const card = element("article", "ng-shot-card");
    card.setAttribute("aria-selected",String((node.properties.ng_selected_shot||0)===index));
    card.onclick=()=>{node.properties.ng_selected_shot=index;for(const [number,entry] of [...cards.children].entries())entry.setAttribute("aria-selected",String(number===index));node.graph?.change();};
    const header = element("div", "ng-shot-header");
    const remove = element("button", "ng-icon-button", "×"); remove.setAttribute("aria-label", `Remove shot ${index + 1}`);
    header.append(element("strong", "", `SHOT ${String(index + 1).padStart(2, "0")}`), remove);
    const times = element("div", "ng-shot-times");
    for (const part of ["start", "end"]) {
      const input = element("input"); input.type = "number"; input.step = "0.1"; input.min = "0"; input.value = shot[part];
      input.setAttribute("aria-label", `Shot ${index + 1} ${part} seconds`);
      // Commit while typing: ComfyUI keyboard shortcuts can keep the focused input from firing blur/change.
      input.oninput = () => { if(input.value===""||!input.checkValidity())return;
        shots[index][part] = Number(input.value); commit(); drawTimeline(); };
      times.append(input);
    }
    const text = element("textarea"); text.value = shot.text;
    text.setAttribute("aria-label", `Shot ${index + 1} action and dialogue`);
    const highlighted=element("div","ng-text-highlight");renderReferences(highlighted,shot.text,entries,element);
    text.oninput = () => { shots[index].text = text.value; renderReferences(highlighted,text.value,entries,element);commit(); };
    remove.onclick = () => { shots.splice(index, 1); commit(); rebuild(); };
    const imageContext=entries.find((entry)=>entry.media==="image"&&shot.text.includes("@"+entry.widgets.name))||entries.find((entry)=>entry.media==="image");
    if(imageContext&&api){const preview=element("img","ng-shot-thumbnail");preview.src=mediaURL(imageContext.widgets.image,api);preview.alt="Reference preview · not a generated shot";card.append(header,preview);}
    else card.append(header);
    const contexts=element("select");contexts.setAttribute("aria-label",`Shot ${index+1} context`);const option=element("option","","+ Assign context");option.value="";contexts.append(option);
    for(const entry of entries){const name=entry.widgets.name;if(name){const option=element("option","",name);option.value=name;contexts.append(option);}}
    contexts.onchange=()=>{if(contexts.value){shots[index].text=`@${contexts.value} `+shots[index].text;commit();rebuild();}};
    card.append(times,text,highlighted,contexts);return card;
  }
  function rebuild() {
    const result = readStory(values(node).shots || ""); shots = result.shots;
    cards.replaceChildren(); add.disabled = !!result.error;
    if (result.error) { cards.append(element("p", "ng-error", result.error)); fallback.open = true; }
    else if (!shots.length) cards.append(element("p", "ng-muted", "Auto scene · your idea describes the whole project. Add shots when you need timing."));
    else shots.forEach((shot, index) => cards.append(shotCard(shot, index)));
    drawTimeline(); raw.sync();
  }
  add.onclick = () => {
    const duration = Number(values(node).project_seconds);
    const start = shots.length ? shots[shots.length - 1].end : 0;
    if (start >= duration) { cards.append(element("p", "ng-error", "Increase project duration or shorten the last shot before adding another.")); return; }
    shots.push({ start, end: duration, text: "" }); commit(); rebuild();
  };
  reset.onclick = () => { shots = []; commit(); rebuild(); };
  const shotWidget = node.widgets.find((widget) => widget.name === "shots"), previous = shotWidget.callback;
  shotWidget.callback = function (...args) { const result = previous?.apply(this, args); if (!writing) rebuild(); return result; };
  function plan(data) {
    chunks.replaceChildren();
    if (!data?.ok) return;
    for (const chunk of data.chunks) {
      const block = element("div", "ng-chunk-block", String(chunk.index + 1));
      block.style.flex = String(chunk.delivered_frames);
      block.title = `Chunk ${chunk.index + 1}: ${chunk.start_s}–${chunk.end_s} s`; chunks.append(block);
    }
  }
  rebuild();
  function contexts(next,providerApi){entries=next;api=providerApi;if(!root.contains(document.activeElement))rebuild();}
  return { root, rebuild, plan, contexts };
}
