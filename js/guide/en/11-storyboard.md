# Storyboard

**H3 Storyboard** lays out a storyboard sheet in the node: a title line and 1–9 numbered panels, each with its time, title,
caption and the shot text for H3. Workflow 6 shows it set up; this chapter explains every part.

![H3 Storyboard](../images/wf6-storyboard.jpg)

## Wiring

One cable: the Context Connector's **H3 context** output (the one that goes to the Director) into the Storyboard's
**H3 context** input. Through it the Storyboard sees your picture cards and the AI. It hands the Director nothing by
cable; its buttons write into the Director. Its outputs (*sheet*, *panels*, *shots*) are optional; left unconnected, the
node does not run with the workflow.

## Panels

- **Panels** and **Panel format** (16:9, 9:16, 1:1, 4:3, 3:4, 21:9).
- Each panel has its **seconds**; panels follow each other (10 s, 2.5 s … are 0–10, 10–12.5 …).
- **Title** and **caption** are drawn on the sheet; the **shot text** is what H3 renders.
- **First frame / Last frame of its shot**: the panel's picture becomes that frame of the shot.

## A panel's picture

A stack of layers:

- **+ Picture**: one of your cards, a file from the input folder, an upload — or a picture of another panel (*From this
  storyboard*). Picture files dragged onto a panel land there.
- **+ Text** and **+ Colour**.
- Drag a layer to move it; the mouse wheel sizes it, with **Shift** it turns. Mirror, opacity, order and hide in the layer
  list. **Use on all panels** copies a layer to every panel. Undo / Redo in the header.
- **Cut out** removes a picture's background (needs `birefnet.safetensors`).

With Qwen Image 2.1 installed (chapter 2):

- **+ Figure from a sheet**: a character card's figure in the pose and angle you write, on a transparent background
  (about 30 s).
- **+ Background**: an empty place in the panel's format (about 20 s).
- **Redraw with Qwen Image 2.1** (or **Redraw all panels**): the whole panel painted anew, keeping its composition, with
  the named characters as references (about a minute). The result is a new layer; the collage stays below it.

## The AI

**What should happen** + **AI: write panel texts**: the AI writes the sheet's title and every panel's title, caption and
shot text. Panel times are never changed; texts you wrote keep their meaning.

## Into the Director

- **Use in Director**: draws the sheet and adds it as a Context card (*Use as: Storyboard*) at the Connector.
- **Send to Director**: the panels become the Director's shots (times and shot texts), the sheet goes onto every shot,
  marked panels become first or last frames. Sound lanes, Look and Prompt stay. The Director asks before replacing its
  shots.
- **Sync from Director**: lengths and texts changed in the Director go back into the panels.

## Tips

- A storyboard plans shots in **References** mode.
- Four to six panels for 10–30 seconds; more panels make very short shots.
- Pictures you drew are saved in `input/h3-storyboard`, so they stay with the project.
