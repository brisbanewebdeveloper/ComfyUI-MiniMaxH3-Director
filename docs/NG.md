# H3 Director NG

Context Image, Video and Audio select/upload files directly in their own cards. Additional native media inputs on these
context nodes are intentionally omitted, following the current product decision. Native sampler/model ports remain available.
One file may be used by several cards: every card keeps its own name, source window and role, and the prompt labels follow the
order the media reach the model, so a video with a soundtrack is numbered before a subject's own voice.

NG is an unfinished Director interface in this pack. The requirements audit found missing AI, context and reference-layout work. It separates reusable media contexts, model connections, story editing and rendering.
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
                                         H3 Director
                                              ↓
                                      H3 Director Output
                                              ↓ sequence
                                      H3 Render Sequence
                                              ↓ VIDEO
                                          SaveVideo
```

Write an idea and set the project duration. The Director displays the planned chunks, actual duration and warnings before rendering.
**Generate video** queues the connected ComfyUI workflow. Sampling uses native ComfyUI loops and samplers, with normal previews and Stop.
Look at SaveVideo for the finished result. The Director itself plans and prepares the project; it does not run a private sampler loop.

For a character and voice, open **H3 Director NG - image and voice.json**, select your own picture and voice in their Context nodes,
and connect the H3 Ref2VA model. Set distinct context names; `@Mage` refers to the image named Mage, and the voice's Speaker field names Mage.

For an existing sampler graph, open **H3 Director NG - native sampler.json**. Director Output supplies native `MODEL`, positive/negative
`CONDITIONING`, `LATENT`, `FLOAT` fps, `INT` width/height and `STRING` prompt. The example uses BasicGuider, whose internal CFG is 1;
negative is ZeroOut of positive. Editable loop examples use the native CFGGuider with an explicit CFG 1.
**Chunk index** selects one prepared chunk. A continuation requires the previous chunk's raw latent on `previous`.
These native sampler outputs describe one chunk; **sequence** carries the whole project to Render Sequence.
The Director's **chunks** supplies the complete list for an editable native loop; Output's **seed** supplies the current chunk seed.

For a complete sequence with editable samplers, use **H3 Director NG - native chunk loop.json** or
**H3 Director NG - two sampler chunk loop.json**. Director's **chunks** starts the loop. A single **H3 Director Output** inside it prepares
the current conditioning, initial AV latent and deterministic seed, using the previous completed AV latent. Use native RandomNoise.
One or two native samplers repeat for every chunk. Native LoRA, Sigma Shift, guidance and schedules stay accessible.
See [connections and continuity contract](NG-external-sampling.md).

## Product nodes

| Node | Responsibility |
|---|---|
| H3 AI Loader | Optional local/API provider configuration; a separate `NG_AI_PROVIDER`, not a diffusion MODEL |
| H3 Context Connector | Native model/CLIP/VAE ports, optional AI and four dynamically growing Context groups |
| H3 Director | Idea, settings, contexts, scene cards, story/chunk timelines, generation summary, prompt inspector and complete chunk list |
| H3 Director Output | Current chunk's native sampler values and seed, plus complete sequence packet for the simple render path |
| H3 Context Image | Image source, content roles, usages, property preservation, preview and presets |
| H3 Context Video | Video player, source range, motion/camera/continuation usages and optional paired audio |
| H3 Context Audio | Player/waveform, source selection, speaker, voice/copy/lock usages and presets |
| H3 Context Text | Text editor, quick insertion, editable templates, context meaning and presets |
| H3 Render Sequence | Expanded native List loop, sampler and collector; outputs VIDEO, IMAGE, AUDIO and notes |

Native port types, names and colors come from ComfyUI. Context identity colors affect the cards and references.
The existing technical nodes remain available under **MiniMax H3 / NG / Expert**, including NG Chunk Planner,
NG Chunk Conditioning, NG Collect, NG Chunk Sequence and NG Studio Laboratory. Saved IDs remain valid.

## Editing the project

**Simple** presents the essential idea, settings and generation controls. **Guided** adds the scene editor, contexts and timelines.
**Expert** exposes additional generation settings. The compiled prompts and manual override are expandable in Guided/Expert.
Switching modes changes presentation, not render settings.

Leave scenes empty to describe the whole project with the idea. Use **+ Shot** to add a timed scene, edit its action/dialogue and times,
then shorten its end before adding another. Drag the story bar or its edges to change timing. The separate generation track shows render chunks.
**Use idea as one scene** clears timed scene overrides and returns to automatic scene planning.

The original shot text remains editable and uses the existing contract:

```text
0-4: @Mage looks up in the sanctuary.
@Mage says: Welcome back.
4-8: @Mage turns toward the window.
```

Times can be seconds or `m:ss.s`. Spoken lines belong where their shot starts; continued chunks carry the action without repeating its dialogue.
Renaming a connected context with the same persistent ID updates its recognized `@Name` references in the idea and shots.
Unknown mentions are highlighted for review. Shot thumbnails are labeled reference previews, not generated frames.

H3 renders at **24 fps** on its `17k + 5` frame grid. The preview reports the real finished length and warns about rounding.
Aspect presets set width/height; Custom preserves explicit dimensions. One resolution applies to the whole project.
`chunk_seconds = 0` selects the planner's 10-second target. H3's trained chunk range is 4–15 seconds.
The style choice adds prompt instructions; it does not load a different model or style adapter.

## Context workspaces

New contexts start compact. **Details** opens their media workspace, and **Compact** closes it.
Select an input file or use **Browse / Upload**. Files are resolved within ComfyUI's input directory; input subfolders are supported.
Missing files stop rendering by name. Absolute paths, traversal and escaping symlinks are rejected.

**Detected Content** describes the medium, independently of **Use As**, which determines its role in generation.
Multiple image content/usage choices are supported. Image Preserve controls for Identity, Outfit, Pose and Background are compiled into
retention instructions; they guide H3 rather than enforce exact pixel preservation.
First/Last Frame anchor the project; Keyframe/Storyboard require a scene time and condition only the chunk containing that time.
Guide time is sampled on H3's latent grid, so subframe precision and a smooth transition are not guaranteed.

Video uses native playback and source start/end fields. Motion/Camera/Whole Structure send references and prompt guidance;
they do not promise exact motion copying. **Continue From Video** uses the final frame of the selected source interval as a starting guide.
**Audio Track** can ignore the video sound or send it as the correspondingly numbered paired audio reference.

Audio shows full-source waveform metadata, draggable selection and zoom. Start/End select the source used for generation;
zero End means file end. Speaker can be a character name or persistent context ID.
Voice guides timbre, Copy asks H3 to reuse sound, and Lock pins encoded source audio while video is generated.
The audio VAE and output codec can change the waveform even with Lock. Preview Volume/Fades affect playback only, as labeled.

Text provides an editable large field, character count, quick bracket placeholders, role choices and templates/examples.
Replace placeholders with real descriptions; `@Name` refers to a connected context. Templates remain ordinary editable text.

## Presets

Save/Save As writes a versioned JSON preset under the current ComfyUI user's `minimax_h3_ng/contexts` folder.
Load restores source, roles, description, property preservation, timing, identity and color. Media bytes and AI credentials are not included.
Saving an existing name replaces it atomically. Loading the same preset twice restores its ID twice; give one copy a new advanced Context ID
if they should be separate items. Duplicate IDs are rejected, and ambiguous names are reported.

## Optional AI

Connect **H3 AI Loader** to the Connector for Director assistance, or directly to a Context for analysis.
Contexts can also inherit the single provider from their downstream Connector. Without an AI connection the manual workflow remains usable.
The four source cards have real execution paths. **Local** chooses an installed text encoder from disk or a running Ollama/LM Studio server. **CLIP / Encoder** consumes a connected generative Load CLIP through native Generate Text. **API** and **Custom** use compatible endpoints. H3's conditioning encoder stays independently connected at the Connector. See [native AI setup](NG-native-ai.md).

Enter provider, base URL, model and declared Vision/Audio capabilities. Timeout, Max tokens and Keep model loaded
change the outgoing request itself and are range-checked in the core. Credentials come from the named server
environment variable; workflow files store the variable name rather than the secret. Use a URL without embedded
credentials/query parameters; `/v1` is supported.
**Configured · not tested** describes configuration, not a successful request. Native sources show the successful action/medium after a real request; changes to the model/settings invalidate that status. Declaring capability does not add it to an incompatible model.

**Analyze** makes one explicit request. Images send bounded thumbnails; videos send three ordered stills from at most the first 15 seconds,
which cannot establish unseen motion. Audio uses at most 15 seconds of mono audio; HTTP providers need `input_audio`, while native models must accept ComfyUI AUDIO. Ollama has no audio transport. **Cancel AI** cancels this action; native cancellation targets its own queue prompt.
**Apply suggestion** changes description/supported content choices, preserving source, usage and preservation settings.

**Auto Direct** asks the connected provider for a timed scene proposal using the idea and context descriptions.
It displays the proposal for review; **Apply scene suggestion** updates editable shots and any proposed soundscape/music.
Changed input invalidates a pending suggestion. Loading, connecting and rendering do not trigger provider requests.
Native CLIP and disk tests with installed Qwen3VL 4B cover real text/image analysis and a timed scene proposal. HTTP transport tests also use a local mock. Full analysis fields, Analyze All, AI control modes and scene-Apply field selection remain unfinished.

## Continuity and verification

`video_audio` pins a previous latent's video tail and about a second of audio before the next chunk; `video` pins only picture,
and `none` renders independent clips. The collector removes pinned heads. The planner tries to place boundaries away from new story actions
and warns when it cannot. Tail continuity reuses the tested PackedLayout adapter, inspired by H3 Motion Context, without changing core ComfyUI.

Read [NG-validation.md](NG-validation.md) for automated checks, native sampler/sequence runs, interruption recovery and quality limits.
Single-seed functional runs show feasibility. Long chains may drift in identity or sound, and pinned audio may lose high frequencies.
Adaptive continuity/crossfades, a full multi-asset relationship editor and broad perceptual quality validation remain further work.
An imperceptible seam and a human listening assessment have not been established.
