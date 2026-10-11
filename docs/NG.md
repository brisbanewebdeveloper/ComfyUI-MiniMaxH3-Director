# H3 Director NG

NG is the second-generation Director in this pack: videos of any length, rendered as several H3 parts
that continue into each other. It separates reusable media (Context nodes), model connections (Context
Connector), story editing (the **Studio**) and rendering (native ComfyUI sampling).
The original timeline Director remains available as **Legacy** with its existing node ID and workflows.
The local 1.0.0 development version is unreleased; the published version remains 0.3.2.


## Start with a connected workflow

Use **example_workflows / H3 Director NG - text studio.json** for a complete text-to-video graph.
Choose your installed H3 FL2VA model, CLIP of type `minimax`, video VAE and audio VAE. The examples use development filenames;
replace model selections if your installation differs. No models or reference media are bundled.

```text
MODEL / CLIP / video VAE / audio VAE ─┐
Image / Video / Audio / Text contexts ├→ H3 Context Connector
H3 AI Loader (optional) ─────────────┘          ↓
                                         H3 Director  (the Studio is the node)
                                              ↓
                                      H3 Director Output
                                              ↓ sequence
                                      H3 Render Sequence
                                              ↓ VIDEO
                                          SaveVideo
```

For a character and voice, open **H3 Director NG - image and voice.json**, select your own picture and voice in their Context nodes,
and connect the H3 Ref2VA model. Give each context a distinct name; `@Mage` refers to the image named Mage.

## The Director node

The Director node **is** the Studio: the whole Studio described below is the node's face in the graph, and the node is as tall as
its content. The Studio writes the node's own widgets, so ComfyUI's unsaved-changes marker and Save/Reload include every edit.
Keys pressed inside it stay there (Delete on one of its buttons does not delete the node); Ctrl/Cmd shortcuts still reach ComfyUI.

A Director saved by the former compact node (440 px wide) grows once when the workflow is loaded, and the nodes to the right
of it and below it move along so nothing overlaps; the same happens for Context nodes saved before they became full cards.

## The Studio

**Full screen** in the Studio's header lifts the same Studio over the whole window; **Esc** or **Back to graph** puts it back
into the node. It has no inner scroll areas. Below about 960 px of width the side panel moves under the timeline. **Generate** queues the connected workflow, exactly like ComfyUI's Queue button.

### Make H3 prompt

The quickest way to a finished prompt, for anyone who does not want to write one. Choose a **direction** (Let the AI decide,
Music video, Song, Story, Action / fight, Calm scene, Dance, Horror, Comedy, Romance, Spicy 18+), whether anyone speaks
(No speech, Dialogue, Narrator, Singing; with words, their language) and press **Make H3 prompt**. Pictures on Context cards
are enough; the Prompt is optional with pictures and is used when there is one. The Director's **Duration** sets the length.

1. The AI is shown the pictures (with their card descriptions) and plans the whole video: the Look, timed shots with action
   and camera, spoken or sung lines, ambience and music. Words you write in quotes or after "says:" are used as they are;
   otherwise the AI writes short lines in the chosen language. Lyrics on an Audio card stay the song's (timed as usual).
   A picture card without a description gets one from this answer.
2. The plan replaces the shots (another view of a figure, "Belongs to", and a place picture are bound to the shots that show
   them), then every render part is written out by the part writer with the direction and that part's pictures, checked and
   kept as the part's own prompt. A part whose answer breaks a rule keeps its compiled prompt and is counted in the message.
3. **Undo** in the message puts the shots, Look, sound fields and card descriptions back. It is also available if Cancel
   or a failed part request stops the build after the plan was applied.

The direction and speech are saved with the Director node. **Spicy 18+** is for adults only: a request or card that speaks
of a minor is refused before any AI is asked, and the AI is told to refuse a picture that suggests one. Whether a model writes
explicit scenes depends on the model (qwen3.5:9b writes them sensual but restrained).

### Prompt and Content

**Prompt** is the story: what happens, in any language, lyrics included. Without shots, the prompt alone carries the project:
a text-only video needs nothing else. A Text card used as **Scene / story** is read the same way, so the story may live in
either place.

- **AI: split into shots** asks the optional AI provider to turn the story into timed shots: action, the camera as a sentence,
  every spoken or sung line as its own entry (speaker, language, delivery, exact words), plus the **Look**, ambience and music.
  It is told when the song sings each lyric line (see the Audio card) and does not repeat those lines; it starts a new shot only
  when the view changes, as MiniMax's guide asks. The proposal appears as dashed shots; **Accept** replaces the current shots
  (and clears the parts' own prompts, which belonged to the old plan), **Discard** leaves everything unchanged. Audio lanes are
  never touched by a proposal.
- **Whole prompt = one shot** turns the prompt into one shot spanning the project.
- **Look (every part)** is what all render parts share: style, place, light. Once there are shots, H3 gets the shots and the Look;
  the Prompt itself is not pasted into every part again (a 27 s song carried its whole verse into each of three parts that way).
  In First / last frame mode the Look opens `[Shot 1]`, in References mode it stands before `[Shot 1]`, as the two guides ask.

Later shots normally receive a timestamped camera cut. An explicit `without cutting`, `No camera cuts`, or continuous/single
take instruction in the shot or shared Look/rules prevents an added cut. Explicit transition text remains unchanged.

**Content** shows one card per Context node connected to the Context Connector, in its context colour, plus a plain **Text-Shot** card.
Drag a card onto the empty timeline to create a shot with it, onto a shot (or click it while a shot is selected) to assign it,
or an audio card onto an audio lane. Cards the current mode cannot use are dimmed (for example a video in First / last frame mode).
Files are chosen in the Context nodes themselves, not in the Studio.

### Timeline

All tracks share one time axis on a **0.1 s grid**.

- **Shots**: drag a shot to move it, drag its edges to change start or end. Drag a shot over another and release to reorder;
  the others close up behind it while gaps stay where they were. A click selects the shot. **+ Shot** adds a 4 s text shot in free room after the selected (or last) shot, else in any free room;
  on a full timeline it halves the selected shot and says so.
- **Audio lanes** run independently of the shots, so a song placed on a lane plays continuously across shots and render parts
  instead of restarting per shot. **+ Audio lane** (or the empty drop zone) adds a lane; drop audio Content on it, move the clip,
  trim it at its edges. A clip has its own story range and **From second in file** (start offset in the file).
  An empty lane can be removed. There are no fixed lanes for voice, music or effects.
- **Render parts** show how the planner splits the project into H3 runs (about 10 s by default), each in its own colour.
  A part's tooltip shows its frames and the frames carried over from the previous part.

Render-part length is a planning preference. The planner limits the number of parts to H3's valid clip lengths.
Reducing the project duration removes newly cut fragments shorter than 0.5 seconds; Undo restores the timeline.
Complete short records from older projects remain intact when they fit within the new duration.
Trimming an audio clip's left edge advances **From second in file** equally for Lock, Copy and Reference,
stopping at the beginning of the file. Moving a clip keeps its file offset.
Renaming a connected Context also updates its `@Name` mentions in the Look, part prompts and spoken text,
including projects without shots. Clip ranges and Context/speaker IDs remain intact.

### Right column: Mode and the selected item

**Mode** is the central choice and applies to the whole project:

| Choice | H3 model | Uses |
|---|---|---|
| **First / last frame** (FL2VA) | first/last-frame model | first and last frame, keyframes, sound |
| **References** (Ref2VA) | reference model | figures, places, videos and voices as references; timed image guides |

Older workflows saved with `auto` keep it and show it as automatic; it is also selectable under **More settings**.

**Turbo** switches between 20 steps and 4 steps with the H3 turbo LoRA. Each mode has its own LoRA selection, preselected from installed
files whose name contains `turbo` and `h3` or `minimax`. If Turbo is on without a LoRA, the Studio picks an installed one, or warns when none is found.
CFG stays 1 in both cases: every official H3 template uses BasicGuider.

Below it is the panel of the selected item:

- **Shot**: start/end, **What happens?**, the Content assigned to this shot, and its spoken lines in order, each with
  speaker (or narrator), language, delivery (says, sings, whispers, shouts, murmurs; a song needs *sings*) and text; **+ Spoken line** adds one, × removes one. **AI: suggest / improve text** asks the
  provider for this shot's text; the suggestion is shown with **Accept** / **Discard** and changes nothing until accepted.
  The panel lists the render parts the shot falls into.
- **Audio clip**: start/end on the story, the offset in the file and how H3 uses it:
  **Lock exactly** (encoded source audio is pinned), **Copy as closely as possible** (H3 is asked to reuse the sound) or
  **Reference only** (mood, voice, style). In First / last frame mode H3 can only take a clip as lock.

### Settings bar

The bar under the timeline has two rows that are always visible:

- **Video**: duration in seconds (any value on the 0.1 s grid; **= <audio card>** takes the length of the longest connected audio,
  e.g. a 27 s song; a longer duration lets the shot that reached the old end run on), render-part length (Auto = about 10 s), resolution preset, width/height, **Picture size** fold-out, FPS (H3 is 24 fps).
- **Sampling**: seed with random toggle, steps, sampler, scheduler, **More settings** fold-out.

Resolution follows the Legacy Director: presets **Native** (short side 768), **Fast** (short side 480) and **Above native** (1920×1088), **From first picture (H3 chooses)**,
and custom sizes on H3's /32 grid. The **Picture size** fold-out has aspect ratio, megapixels, **Fit pictures** (crop, stretch, pad,
pad green) and **Reference images** (*Like video* is fastest).
With width and height 0, the size comes from the first frame picture, or else from the first image, using H3's rule
(short side 768, area at most 768·1344, multiples of 32); without any picture it falls back to 1344×768 and says so.

**More settings** contains continuity between render parts (picture and sound / picture only / hard cuts), the overlap,
ambient sound, music, style and the video/audio sigma shifts.

### Prompts per render part

**Show prompts** opens a drawer at the bottom with the actual prompt each render part receives, coloured like its part,
its reference budget (pictures/videos/audio used of H3's limits) and all plan warnings with a short heading. A badge says where
each part's prompt comes from: compiled, AI-written, edited, or manual.

- **Write with AI** (one part) or **Write all parts with AI** asks the AI Loader's model to write the part out in full, the way
  MiniMax's own hosted pre-processing does. The AI writes only prose: the description and the two sound fields. The alignment
  line, subject definitions, summary, retention analysis, cut times, every `<d>` line, the speaker IDs and the labels stay the
  planner's. What a model reliably gets slightly wrong is put back (a time on Shot 1, a sung line without its speaker,
  re-punctuated lyrics, lyric lines left out); anything else is refused with the reason and nothing changes. **Accept** stores it.
- **Edit** lets you write the part yourself; **Save** stores it, **Reset** returns to the compiled prompt.
- An AI-written or edited prompt is kept with the plan it was written for. When the plan of that part changes (timing, shots,
  media, Look), the compiled prompt is used again and the badge says "own prompt outdated".
- **Manual prompt** under More settings still replaces every part's prompt.

While an AI action runs, a status at the bottom of the window shows the elapsed time against the AI Loader's timeout and
**Cancel**. Failures stay there until dismissed; short confirmations disappear by themselves.
This is the compiler's real output, refreshed live while you edit.

## Rendering paths

- **Simple**: Director → Director Output → Render Sequence → SaveVideo (the text studio example). Render Sequence expands into
  native StartLoop/List, conditioning, SamplerCustomAdvanced and EndLoop with normal previews and Stop. When Turbo is on,
  `LoraLoaderModelOnly` is inserted on the model.
- **Your own sampler**: **H3 Director NG - native sampler.json**. Director Output supplies native `MODEL`, positive/negative
  `CONDITIONING`, `LATENT`, fps, width/height, prompt and seed for one chunk; **sequence** carries the whole project.
  A continuation requires the previous chunk's raw latent on `previous`.
- **Live preview**: put **🎯 Preview Override (live)** between Director Output's MODEL and your guider.
  Load `taeh3.safetensors` with Load VAE, connect it to Context Connector's `preview VAE`, and connect
  Director Output's `preview VAE` to the preview node. Only that node has a buffered player with pause,
  scrubbing and independent playback/update status. At 24 FPS it retains
  every decoded frame and the clip's full duration. See [decoder setup and controls](../README.md#live-preview-while-sampling).
- **Editable loop**: **H3 Director NG - native chunk loop.json** or **two sampler chunk loop.json**. The Director's **chunks** starts
  the loop and one Director Output inside it prepares each chunk. See [connections and continuity contract](NG-external-sampling.md).

## Product nodes

| Node | Responsibility |
|---|---|
| H3 AI Loader | Optional local/API provider configuration; a separate `NG_AI_PROVIDER`, not a diffusion MODEL |
| H3 Context Connector | Native model/CLIP/video VAE/audio VAE ports, optional preview VAE and AI, and four dynamically growing Context groups |
| H3 Director | The Studio itself in the graph (Full screen on demand); outputs the project result and the chunk list |
| H3 Director Output | Current chunk's native sampler values, seed and steps/cfg/sampler/scheduler (also as SAMPLER and SIGMAS), optional preview VAE, plus complete sequence packet for the simple render path |
| H3 Context Image | Full card: picture, what is in it, default role, what to keep, figure link, description, preset |
| H3 Context Video | Full card: player, part of the file, motion/camera/continue roles, its own sound |
| H3 Context Audio | Full card: waveform with selection, voice/copy/lock roles, whose voice, listening controls |
| H3 Context Text | Full card: note, quick insert, templates, role (Scene / story is read by the AI split) |
| H3 Render Sequence | Expanded native List loop, sampler and collector; outputs VIDEO, IMAGE, AUDIO and notes |

The technical nodes remain available under **MiniMax H3 / NG / Technical** (NG Chunk Planner, NG Chunk Conditioning,
NG Collect, NG Collect Video for long projects, NG Project Chunks, NG Studio Laboratory). Saved IDs remain valid.

## Project data

Shots and audio clips are stored in the Director's `shots` widget as one JSON document (`format: "h3-director-shots"`).
Old timed text such as `0-4: @Mage looks up.` still loads. See [the shot contract](NG-shots.md).
New Director widgets (`turbo`, the two turbo LoRAs, `resize_method`, `ref_image_size`) are appended at the end, so older
workflows keep their values; an older NG workflow's trailing empty value is repaired on load.

H3 renders at **24 fps** on its `17k + 5` frame grid. The plan reports the real finished length and warns about rounding.
One resolution applies to the whole project. `chunk_seconds = 0` selects the planner's 10-second target; H3's trained chunk range is 4–15 seconds.
The style choice adds prompt instructions; it does not load a different model.

In First / last frame mode the prompt carries no `@refN` tags: mentions become plain names and a spoken line becomes `@voice(Name) says:`.

## Context cards

Each Context node is a full card in the graph (Image, Video, Audio, Text). The card says **what** the material is and
**who** it belongs to; **when** and **how long** it plays is set in the Studio (shots and audio lanes). The node grows with
its card, so cards never overlap their neighbours.

- **Top row:** name (`@Name` in the Studio), the file from ComfyUI's input folder with **Upload**, and whether the AI has
  analysed it. Files resolve inside the input directory; missing files stop rendering by name.
- **What is in it:** the content kinds of this medium. **✦ Analyze** asks the connected AI; its suggestion is shown with
  **Accept / Discard** and changes nothing until accepted.
- **Use as (default):** the role the card has unless a shot or lane clip in the Studio says otherwise. The hint under it
  knows the Director's mode and warns when a role does nothing there (e.g. a reference picture in First / last frame mode).
- **In the Studio:** where the connected Director uses the card (shots, spoken lines, audio lanes, `@Name` in the text);
  a card bound to no shot is part of every render part.
- **Preset** (save / load) and **Color** at the bottom.

**Image:** preview, **Keep in the video** (identity, outfit, pose, background — guidance for H3, not pixel-exact),
**Belongs to** (an outfit or pose picture presented together with a figure; empty = the picture is a figure of its own)
and a description. First / last frame open or end the video, or the shot the picture is dropped on in the Studio.
Global first / last frame cards also become timed native guides in References mode; they do not guarantee pixel-exact output.
Keyframe and storyboard guide the start of the shot they are dropped on; a time stored on an older card still wins.
Guide time is sampled on H3's latent grid.
The accompanying H3 encoder uses the released image processor's 65,536–16,777,216 pixel bounds. Video blocks share
the released video's 4,096–25,165,824 pixel budget across all selected reference frames, including odd-frame padding.

**Video:** player and **Part of the file to use** (drag across the strip). Motion / camera / whole structure send references
and prompt guidance, not exact copies; **Continue from video** starts from the last frame of the chosen part.
**Its own sound** ignores the soundtrack or sends it along as the paired audio reference.
The native reference node keeps the selected frames and lets the VAE pad incomplete temporal blocks. When the target duration
limits the reference, its paired soundtrack is limited to the same window.

**Audio:** play button and waveform; drag in it to choose the part of the file. **Whose voice** names the figure for the
Voice role and the singer of the Lyrics. **Listen here** (volume, fades) only affects playback on the card. Voice guides
timbre, Copy asks H3 to reuse sound, and Lock pins encoded source audio during sampling. Both NG collectors restore the original
source waveform inside Lock spans, with the selected source offset and overlapping tracks mixed; sound outside stays generated.
The export codec can still change samples. This avoids short silent tails caused by rounding the native audio latent grid.

**Lyrics** on an Audio card are LRC lines, `[mm:ss.xx] words`, in seconds of the file; an empty stamped line is a pause.
**⟳ Time with Whisper** keeps your own words and takes only the times from a local Whisper model (`models/whisper/small.pt`
or larger; while a render runs it stays on the CPU). Without lines it writes down what it hears. **Stamp line** sets the
selected line's time by ear while the song plays. Where the card plays exactly (Lock or Copy, on an audio lane, a shot or the
whole project), each render part gets only the lines sung in it, as `<Subject 1> (S1) sings, <d>[English] …</d>` in the
shot where they are sung. Measured on the 27 s elf song: Whisper small heard all eight lines in 7 s.

**Text:** a note in any language, with **Quick insert** brackets, templates and the role. As **Scene / story** it is story:
the AI split reads it like the Prompt, and with shots it is not pasted into every part. In every other role (style, rule,
character, camera rule, …) it goes into every render part. The former **Build H3 prompt** is gone: it wrote a complete H3
block that then nested inside the Director's own; final prompts are written per render part in the Studio.

One file may be used by several cards: every card keeps its own name, part of the file and role. Prompt labels follow the
order the media reach the model. Renaming a card updates its `@Name` mentions through its stable ID.

## Figures and their assets

An independent reference picture is a figure (Subject). **Belongs to** on an image, video or text card links that asset
to a figure, for example an outfit picture and a walk-cycle video to Alice; audio uses **Whose voice**. The compiler
presents linked assets with their figure; `@Outfit` names its picture, `@Alice` the figure. Older workflows that linked one
asset to several figures keep that until the choice is changed on the card.

## Presets

Save/Save As writes a versioned JSON preset under the current ComfyUI user's `minimax_h3_ng/contexts` folder.
Preset names are separate for each media type: saving an audio preset replaces only an audio preset of that name.
Existing preset files remain readable.
Load restores source, roles, description, property preservation, timing, identity, Subject assignments and colour.
Media bytes and AI credentials are not included. Duplicate IDs are rejected, and ambiguous names are reported.

## Optional AI

Connect **H3 AI Loader** to the Connector for Studio assistance, or directly to a Context for analysis.
Without an AI connection everything works manually; the Studio's AI buttons are disabled and say why.
**Local** chooses an installed text encoder or a running Ollama/LM Studio server, **CLIP / Encoder** uses a connected generative
Load CLIP, **API** and **Custom** use compatible endpoints. See [native AI setup](NG-native-ai.md).
Credentials saved with the AI Loader are read from the requesting user's key store by every HTTP AI action. A stored key
takes precedence over the server environment fallback; workflow files store the variable name, not the secret.
H3's own conditioning encoder (`qwen3vl_32b_minimax_h3_*`, 50 of 64 layers, no output head) cannot write text; an AI job on it stops at once and says so. Use e.g. `qwen3vl_4b_fp8_scaled` (type stable_diffusion) or Ollama.
Splitting into shots always allows at least 2048 tokens, because a shot list cut off at a lower **Max tokens** is unusable.
Split and Make H3 prompt accept a complete JSON plan with surrounding explanatory text. Malformed or ambiguous answers
remain errors; the Max tokens hint is reserved for an unfinished JSON answer.

**✦ Analyze** on a Context card makes one explicit request; **Accept** fills description, content and "Use as" from the roles the card shows (a Text card: "Use as" only). What each AI function does and which models were tested: [native AI](NG-native-ai.md#what-each-ai-function-does-tested-2026-10-05).
Video analysis samples three frames across the first 15 seconds, using container duration when stream timing is absent.
In the Studio, AI proposals for shots are reviewed before they change anything ([shot drafts](NG-shot-drafts.md)).
Loading, connecting and rendering never trigger provider requests.

## Continuity and verification

`video_audio` pins a previous part's video tail and about a second of audio before the next part; `video` pins only picture,
and `none` renders independent clips. The collector removes pinned heads. With a pin, the picture is decoded across the joins
as one latent (each part's regenerated head dropped), one window at a time, so the video VAE's clip blending runs over the seam
instead of restarting at every part; sound is still decoded per part. In FL2VA with a pin, a shot with a First frame picture of
its own opens a new part without a pin, so the picture is the part's real first frame; the shot start moves to the nearest H3
grid frame (a plan note says by how much). Inside a pinned part H3 takes such a picture as the end of the running take
instead. The planner tries to place boundaries away from new story actions
and warns when it cannot. Audio on a lane is cut per part at its story position, so it continues across the seam.

Read [NG-validation.md](NG-validation.md) for automated checks and native GPU runs. Single-seed functional runs show feasibility;
long chains may drift in identity or sound, and pinned audio may lose high frequencies. An imperceptible seam and a human listening
assessment have not been established.

## Not in the Studio (yet)

- The old inspector's **Analyze all contexts** and raw Director-Context JSON view.
- Adaptive continuity/crossfades, Subjects without an image and a relationship graph remain further work.
