# NG: videos of any length

NG is the second generation of this pack. The original Director (now **Legacy**) is a timeline editor for one H3 run of
4–15 seconds. NG plans a whole video, however long, as a chain of H3 runs that continue each other, and takes its pictures,
voices, clips and notes as small reusable nodes instead of one big editor.

The legacy nodes are untouched and keep working. NG nodes have their own names, so both can sit in the same workflow.

## Quick start

1. Open **example_workflows → `NG Director - text project.json`**.
2. Pick your models (the example uses the fl2va checkpoint, the CLIP and the two VAEs).
3. Write what the video is about in **idea**, set **project_seconds**, queue.

The node on the left of the plan shows what will happen *before* you render: how many chunks, how long each is, what the prompt of
every chunk looks like, and notes about anything that was adjusted.

## The nodes

| Node | What it does |
|---|---|
| **NG Director** | The idea, the length, optional shots, and the context items go in. A list of chunks comes out (one per H3 run), plus a plan and the notes as text. It renders nothing. |
| **NG Context Image / Video / Audio / Text** | A picture, a clip, a sound or a note, each saying what it *means* (content) and what the model should *do* with it (usage). |
| **NG Chunk Conditioning** | Inside the loop: builds the prompt, loads the references and pins the end of the previous chunk, for one chunk. |
| **NG Collect** | After the loop: decodes every chunk, cuts off the pinned heads and joins picture and sound into one video. |

The loop itself is ComfyUI's own **Start Loop / End Loop** (List mode, *accumulate* on). The sampler inside is the normal
`SamplerCustomAdvanced`, so progress, preview and interrupt work as for any other render.

## How a long video is made

```
idea + shots + context items
        │
   NG Director ─── a list of chunks (each on H3's 17k+5 frame grid)
        │
   Start Loop (List) ─ one chunk per iteration ───────────────┐
        │                                                      │
   NG Chunk Conditioning ← the previous chunk's latent          │
        │   prompt + references + pinned tail                   │
   sampler                                                      │
        │                                                      │
   End Loop (accumulate) ──────────────────────────────────────┘
        │
   NG Collect → one video with sound
```

**Continuing a chunk.** The last 22 frames and the last second of sound of the previous chunk are pinned in front of the new chunk
as never-denoised conditioning, cut straight out of its latent (no decode, no re-encode). The model then continues rather than starts
over. The pinned head is cut off again when the chunks are joined, which costs 0.9 s per join. The idea comes from
[NikoDemon80's H3 Motion Context](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context); NG re-implements it independently
and checks it against ComfyUI's own layout in its tests.

**Frame grid.** H3 renders `17k + 5` frames. The planner chooses chunk lengths so that every sampled clip is on that grid; the finished
video can therefore differ from `project_seconds` by a fraction of a second, and the notes say by how much.

## Shots

Leave **shots** empty and the **idea** carries the whole video. Or write one shot per line:

```
0-12: @Alice walks through the market.
@Alice says: Hello there.
12-30: @Alice sits down by the fountain.
```

Times are seconds, `m:ss` or `m:ss.s`. Lines below a time belong to that shot. `@Name` points at a context item by its name;
`@Alice says: …` writes dialogue. A shot that began in an earlier chunk keeps its action but not its spoken lines, which belong to
where the shot starts.

## Context items

Each item has a **name**, a **description** (one sentence, written into the prompt), **content** (what is in it), **usage** (what to do
with it) and **preserve** (how closely to stay true to it).

| Medium | Usage | Meaning |
|---|---|---|
| Image | `reference` | A character, outfit, place… the model keeps it recognisable. Needs the ref2va model. |
| | `first_frame` / `last_frame` | Opens or closes the video. |
| Audio | `voice` | A voice. Set **speaker** to the name of the character who talks with it. |
| | `lock` | The sound is held exactly; the video is made around it, across chunks. Needs the audio VAE. |
| | `copy` | The model reuses the sound (works most of the time, not always). |
| Video | `motion` | A 2–15 s clip whose motion and camera work the model follows. |
| Text | `style` / `rule` | A note that applies to the whole video. |

Pictures, voices and clips switch the project to **ref2va** automatically; with none of them it is fl2va (text and frames). Connect both
models to *NG Chunk Conditioning* and only the one that is needed is loaded.

Files must be in the top level of ComfyUI's `input` folder (the upload button puts them there).

## Settings worth knowing

| Setting | Default | Notes |
|---|---|---|
| continuity | `video_audio` | `video` pins only the picture; `none` renders independent clips. |
| pin_frames | 22 | 5, 22, 39 or 56. 22 is the default; 5 saves most of the 0.9 s per join and still continues the sound. |
| chunk_seconds | 0 (= 10 s) | Target length of one run. H3 is trained for 4–15 s. |
| soundscape | "ambience that fits the scene" | H3's prompt format asks for it. Write `N/A` for silence. |

## What was measured, and what was not

All of it is in `_notes/NG/03-experiments.md` of the development folder; the short version:

- A pinned picture and sound make the next chunk continue: the sound over the pinned stretch matches the previous chunk's end with a
  correlation of 0.92, against 0.13 without the pin.
- Across five joins nothing got worse from join to join, but **the sound loses its highs along a long chain** (the share above 4 kHz
  fell to a ninth after five joins). NG warns from the fifth join on.
- A new action asked for right after a join comes **about 2.4 s late**, because the pinned picture holds the old action. So the planner
  **moves a chunk boundary** (in whole 17-frame steps, keeping the total) so that no shot starts less than 2.5 s after it, and only warns when it cannot
  (one seed; the effect of the move itself has not been re-measured).
- A locked song stayed locked across a join (envelope correlation 0.97, constant 4 ms offset before and after).
- A voice reference works without any picture (it changed the timbre toward the reference, 0.97 against 0.69 without).

Tested so far at 384×576 with 8 steps for the function checks and one run at 768×1152 with 20 steps. Everything was measured
with numbers, not listened to. One seed per case. Treat the figures as evidence, not as guarantees.

## Known limits

- One resolution for the whole project (a latent cannot be resized between chunks).
- A reference file has to be in the top level of `input`.
- No presets, no AI analysis of context items and no scene-card or timeline editor yet; shots are text.
- The look of a long chain is not yet judged by ear or eye over many chunks, only by measurement.

## Troubleshooting

| Message | Meaning |
|---|---|
| *The video will be 29.96 s, not 30.00 s* | Chunks sit on H3's frame grid. |
| *begins 1.9 s after a chunk boundary* | The change will come late; shift the shot, or the boundary. |
| *N joins: the sound loses its highs* | Normal for long chains; consider fewer, longer chunks. |
| *the previous chunk was WxH but this one is …* | The resolution changed in the middle of a project. |
| *audio references need the audio VAE* | Connect `minimax_h3_audio_vae` to NG Chunk Conditioning. |
| *the image 'x' is not in ComfyUI's input folder* | The file was moved or deleted after the node was set. |
