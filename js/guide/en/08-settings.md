# Settings (gear)

The gear in the Director's header (or **Settings** at the bottom) opens everything a first video does not need. Every
field has an ⓘ with a short explanation. **Done** closes it; all changes are saved with the workflow.

![Settings](../images/wf2-studio-settings.jpg)

## Video

- **Render part**: how long one H3 run is. *Auto* is about 10 s. 5 s needs less memory; 15 s gives fewer joins.
  *30 s* only works at small sizes.
- **Width / Height**, **Aspect ratio**, **Megapixels**: the size of the video. Edges are multiples of 32. The hint on the
  right says whether the size is in H3's native range.
- **Fit pictures**: how a picture of another shape is fitted: *Crop* (default), *Stretch*, *Pad*, *Pad green*.
- **Reference images**: *Like video* is fast; *Large, 2048 px* keeps faces better but is slower (References mode).

## Sampling

- **Seed** with the dice for a random one. Another seed gives another take of the same shots.
- **Steps**, **Sampler**, **Scheduler**: with a known turbo LoRA they are set by the LoRA.
- **Shift video** (12) and **Shift audio** (3): H3's defaults; leave them unless you know why.

CFG is always 1, as in every official H3 template.

## Turbo

Shown when **Turbo on** is set in the Director. One LoRA per mode (*First / last frame*, *References*). A known LoRA shows
its measured values, e.g. *Known LoRA: 6 steps · res_multistep · simple*. Without a LoRA the Studio warns.

## ControlNet

Only for control videos (Workflows 7 and 8): **Strength** (1 follows the control video closely, 0.5 keeps more of your
figure's shape) and the advanced **Denoising range** (a share of the sampling steps, not of video time).

## After a crash

**Resume on** keeps every finished render part in `output/h3-director-resume`. Queue the same project again and the
finished parts are loaded instead of rendered; a changed part and all parts after it render again. **Delete the kept parts
when the video is done** (on) cleans up after a finished video. After changing a model file, empty that folder.

## Sound, style and transitions

- **Ambience** and **Music**: the background sound of every part, in words (*N/A* = no music).
- **Style**: *Cinematic*, *Anime*, *Documentary*, *Photorealistic* or none. It adds words to the prompt; it does not load
  another model.
- **Transition between render parts**: *Continue picture and sound* (default), *Continue picture only* or *Hard cuts*.
- **Overlap**: how much of the previous part the next one sees (5, 22, 39 or 56 frames). 22 frames (0.9 s) is the default.

## Models

The extra models for place pictures, storyboard and control videos. *Automatic* takes the official file names; choose
your own file if yours is renamed. A green tick shows the file was found.

## Manual prompt

Replaces the prompt of **every** render part. Leave it empty unless you write the whole H3 prompt yourself; to change one
part, use *Prompts per render part* instead.
