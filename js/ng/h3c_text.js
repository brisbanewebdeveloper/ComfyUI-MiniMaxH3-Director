// The Text card's body: the note (or the English H3 block built from it), quick inserts, role and templates.
// The `text` widget is what the Director reads; the note and the built prompt are both kept in node properties
// (ng_text_note / ng_text_ai), so switching between them never loses either.
import { h } from "./h3s_dom.js";
import { INSERTS, TEMPLATES } from "./h3c_model.js";
import { usageBox, ownerBox } from "./h3c_parts.js";

export const CHARACTER_LIMIT = 2000;
const BLOCKS = [["global", "Scene + style"], ["storyboard", "Storyboard (shots)"]];

export function textBody(S, actions) {
  const ai = S.textMode === "ai", text = S.values.text || "";
  const editor = h("textarea", { class: "h3c-in h3c-editor", rows: 9, value: text, readOnly: ai, spellcheck: false, "aria-label": ai ? "AI prompt" : "My note",
    placeholder: "Describe the video, a rule or a look, in any language. [character] marks a part to fill in; @Name points at a connected Context.",
    oninput: (event) => actions.setNote(event.target.value) });
  S.els.editor = editor;
  const block = h("select", { class: "h3c-in", "aria-label": "Prompt block", onchange: (event) => actions.buildOption("block", event.target.value) },
    BLOCKS.map(([value, label]) => h("option", { value }, label)));
  block.value = S.build.block;
  const seconds = h("input", { class: "h3c-in", type: "number", min: "4", max: "15", step: "1", value: String(S.build.seconds), style: { width: "64px" },
    "aria-label": "Video length in seconds", onchange: (event) => actions.buildOption("seconds", Number(event.target.value)) });
  const template = h("select", { class: "h3c-in", style: { flex: "1 1 auto" }, "aria-label": "Template" },
    Object.keys(TEMPLATES).map((name) => h("option", { value: name }, name)));
  return [
    h("div", { class: "h3c-grid", style: { gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)" } },
      h("div", { class: "h3c-box" },
        h("div", { class: "h3c-cap" }, ai ? "AI prompt · read-only, the Director reads this" : "My note · the Director reads this", h("span", { class: "h3c-grow" }),
          h("span", { class: text.length > CHARACTER_LIMIT ? "h3c-lbl h3c-warn" : "h3c-lbl", style: { textTransform: "none" } }, `${text.length} / ${CHARACTER_LIMIT}`)),
        h("div", { class: "h3c-segs", style: { gridTemplateColumns: "repeat(2,minmax(0,1fr))" } },
          h("button", { class: ai ? "" : "on", onclick: () => actions.textView("note") }, "My note"),
          h("button", { class: ai ? "on" : "", disabled: !S.hasAiText, title: S.hasAiText ? "" : "Build a prompt first", onclick: () => actions.textView("ai") }, "AI prompt")),
        editor,
        h("div", { class: "h3c-row" }, block, seconds, h("span", { class: "h3c-lbl" }, "s"),
          h("button", { class: "h3c-btn ai", disabled: !S.ai || S.busy, title: S.ai ? "Rewrite the note into the English block H3 expects; your note is kept."
            : "Connect an H3 AI Loader to this card or to the Context Connector.", onclick: actions.build }, S.busy ? "Building …" : "✦ Build H3 prompt"),
          S.busy ? h("button", { class: "h3c-btn", onclick: actions.cancel }, "Cancel") : null),
        h("span", { class: "h3c-hint" }, "Any language → the English block H3 expects. Your note stays.")),
      h("div", { class: "h3c-box" }, h("div", { class: "h3c-cap" }, "Quick insert"),
        INSERTS.map(([key, label, color]) => h("button", { class: "h3c-ins", style: { borderColor: `${color}66`, color }, disabled: ai,
          onclick: () => actions.insert(key) }, `+ ${label}`)))),
    h("div", { class: "h3c-grid", style: { gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" } }, usageBox(S, actions, 2),
      h("div", { class: "h3c-grid" },
        h("div", { class: "h3c-box" }, h("div", { class: "h3c-cap" }, "Templates"),
          h("div", { class: "h3c-row", style: { flexWrap: "nowrap" } }, template,
            h("button", { class: "h3c-btn", disabled: ai, onclick: () => actions.useTemplate(template.value) }, "Use"))),
        ownerBox(S, actions, "A rule for the whole project. Link it to a figure to scope it to that figure."))),
  ];
}
