# NG: videos of any length

NG is the second generation of this pack. The original Director (now **Legacy**) is a timeline editor for one H3 run of
4–15 seconds. NG plans a whole video, however long, as a chain of H3 runs that continue each other, and takes its pictures,
voices, clips and notes as small reusable nodes instead of one big editor.

The legacy nodes are untouched and keep working. NG nodes have their own names, so both can sit in the same workflow.

## Quick start

NG requires native **Start Loop / End Loop** with List mode and accumulation. The live checks used ComfyUI 0.37.0 and frontend 1.53.6.

1. Open **example_workflows → `NG Director - text project.json`**.
2. Pick your models (the example uses the fl2va checkpoint, the CLIP and the two VAEs).
3. Write what the video is about in **idea**, set **project_seconds**, queue.

For a character and voice, open **`NG Director - image and voice.json`**, upload your own picture and voice in the two Context nodes,
and choose your installed models. The example filenames are placeholders; media is not bundled.

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
where the shot starts. With **shots** empty, each continued chunk also receives an explicit instruction to continue the same scene,
subject and action. This is a prompt instruction, not a guarantee of stable identity.

## Context items

Each item has a **name**, a **description** (one sentence, written into the prompt), **content** (what is in it), **usage** (what to do
with it) and **preserve** (how closely to stay true to it).

| Medium | Usage | Meaning |
|---|---|---|
| Image | `reference` | A character, outfit, place… the model keeps it recognisable. Needs the ref2va model. |
| | `first_frame` / `last_frame` | Opens or closes the video. |
| Audio | `voice` | A voice. Set **speaker** to the name of the character who talks with it. |
| | `lock` | Holds the source audio latent across chunks and makes the video around it. Needs the audio VAE; reconstruction can alter the waveform. |
| | `copy` | The model reuses the sound (works most of the time, not always). |
| Video | `motion` | A 2–15 s clip whose motion and camera work the model follows. |
| Text | `style` / `rule` | A note that applies to the whole video. |

Pictures, voices and clips switch the project to **ref2va** automatically; with none of them it is fl2va (text and frames). Connect both
models to *NG Chunk Conditioning* and only the one that is needed is loaded.

Files must be inside ComfyUI's `input` folder; subfolders are supported. NG rejects absolute paths, traversal and symlinks that
lead outside it. A moved or deleted reference stops rendering with a message naming the item.

New context cards receive a persistent **context_id**. Renaming a card does not change its identity. Use distinct names for
`@mentions` and speakers. Loading the same preset twice restores the same ID: assign a different advanced **context_id** if those
cards should represent different items. **color** accepts `#rrggbb`; leaving it empty restores the medium's colour family.

## Presets and analysis

**Save preset** writes one versioned JSON file under the current ComfyUI user's `minimax_h3_ng/contexts` folder. Saving the same
name replaces that preset atomically. **Load preset** restores source, name, description, role, preservation, colour and identity.
Presets reference input files; they do not bundle them. Provider settings and media bytes are excluded.

**Analyze context** is optional and runs only when clicked. Expand **Analysis provider** to choose Ollama, LM Studio or a compatible
custom endpoint, model and capabilities. An empty address/model uses the legacy transport's defaults where available. Put credentials
in the ComfyUI server environment and enter only their variable name in **api key env**. Restart ComfyUI after changing its environment.
Use a base URL without embedded credentials or query parameters; a trailing `/v1` is supported.

Image analysis sends a bounded thumbnail; video analysis sends three ordered stills from the first 15 seconds. It cannot establish
unseen motion. Audio analysis sends at most the first 15 seconds as mono WAV and requires a provider/model that supports `input_audio`;
the Ollama transport has no audio input. Text needs no vision capability. Declaring a capability does not make an incompatible model support it.

The result is a suggestion. **Apply suggestion** updates the description and a supported content choice; **usage**, **preserve** and
source stay as set. A context changed during analysis must be analyzed again before applying. Rendering never contacts an analysis provider.

## Plan views

**Simple** shows the project summary and warnings. **Guided** adds per-chunk length and reference details. **Expert** also exposes
the exact compiled H3 prompt. The choice is saved in the workflow and changes the inspector presentation only. Render settings
remain available in each view; switching views does not change prompts, chunks or sampling.

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
  (one seed). Fresh NG runs exercised the moved 9.42 s and 19.33 s boundaries; a controlled delay comparison remains unverified.
- A locked song stayed locked across a join (envelope correlation 0.97, constant 4 ms offset before and after).
- A voice reference works without any picture (it changed the timbre toward the reference, 0.97 against 0.69 without).

Tested so far at 384×576 with 8 steps for the function checks and one run at 768×1152 with 20 steps. Everything was measured
with numbers, not listened to. Fresh E13 contact sheets were also inspected. One seed per case. Treat the figures as evidence, not as guarantees.
See [NG-validation.md](NG-validation.md) for the current software checks, live runs and release limits.

## Known limits

- One resolution for the whole project (a latent cannot be resized between chunks).
- Scene cards, an editable timeline, AI Auto Direct and adaptive continuity remain later work; shots are text.
- Scene `keyframe` and `storyboard` roles are reserved for that editor and are not offered by the current cards. Imported roles receive a warning.
- A long chain can drift in appearance and audio timbre. Listening and broad multi-seed quality validation are still outstanding.
- Preview/progress is provided by the standard sampler in the native loop; accumulated latents consume memory until collection.

## Troubleshooting

| Message | Meaning |
|---|---|
| *The video will be 29.96 s, not 30.00 s* | Chunks sit on H3's frame grid. |
| *begins 1.9 s after a chunk boundary* | The change will come late; shift the shot, or the boundary. |
| *N joins: the sound loses its highs* | Normal for long chains; consider fewer, longer chunks. |
| *the previous chunk was WxH but this one is …* | The resolution changed in the middle of a project. |
| *audio references need the audio VAE* | Connect `minimax_h3_audio_vae` to NG Chunk Conditioning. |
| *the image 'x' is not in ComfyUI's input folder* | The file was moved or deleted after the node was set. |
