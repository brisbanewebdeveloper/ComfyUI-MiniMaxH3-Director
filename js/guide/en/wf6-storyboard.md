# Workflow 6 · Storyboard

Plan the shots as a storyboard sheet first: numbered panels with a picture, a title, a caption and a shot text each. One
click turns the panels into the Director's shots, with the sheet as a storyboard reference for H3.

![The whole workflow](../images/wf6-overview.jpg)

The storyboard is large, so it has its own group below the Director (group 4). The rest is the same as in Workflow 2.

**The steps in short**

1. Put your character into the **Image** card.
2. In the **H3 Storyboard** choose the number of panels and the panel format.
3. Fill the panels (pictures, text, colour), or let the AI and Qwen Image do it.
4. Press **Use in Director** (the sheet becomes a Storyboard card at the Connector), then **Send to Director**.
5. Check the shots in the Director and press **Generate**.

## 1 · Models

![The model loaders](../images/wf6-models.jpg)

The same six loaders as in every workflow. Drawing panels needs extra models (see below); without them you place your own
pictures.

## 2 · H3 Storyboard

![H3 Storyboard](../images/wf6-storyboard.jpg)

- **Panels** and **Panel format**: how many panels and which shape (16:9, 9:16 …). Each panel gets a time; together they
  make the video's length.
- **The sheet** (left): click a panel to edit it on the right. **What should happen** + **AI: write panel texts** lets the
  AI write the title, caption and shot text of every panel.
- **A panel** (right): **+ Picture** (one of your Image cards), **+ Text**, **+ Colour**; with Qwen Image 2.1 also
  **+ Figure from a sheet** and **+ Background**, and **Redraw with Qwen Image 2.1** paints the whole panel. Drag a layer
  to move it; the mouse wheel sizes it, with Shift it turns.
- **First frame / Last frame of its shot**: the panel's picture becomes a frame of the shot instead of only a plan.
- **Shot text for H3**: framing, action and camera of this panel's shot.
- **Use in Director** draws the sheet and adds it as a Context card (*Use as: Storyboard*) at the Connector.
- **Send to Director** writes the panels as shots into the Director (times and shot texts), puts the sheet on every shot
  and the marked panels as first or last frames. **Sync from Director** takes changed lengths and texts back into the panels.

Extra models (optional, the gear of the Storyboard shows what was found): **Qwen Image 2.1** and its text encoder and VAE
for drawing panels, **BiRefNet** for cutting out a figure.

## 3 · H3 Director

![H3 Director](../images/wf6-director.jpg)

After **Send to Director** the timeline has one shot per panel. Edit them like any shot, then **Generate**.

## Tips

- A storyboard plans shots in **References** mode only.
- Four to six panels for 10–30 seconds work well; more panels make very short shots.
