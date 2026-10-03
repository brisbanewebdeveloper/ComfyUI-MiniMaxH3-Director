# H3 Director NG validation

Local product work on branch `ng`, based on the existing NG foundation. Public release remains 0.3.2; local 1.0.0 is unreleased.
No push, tag or publication. New user TXT/PNG references define the Connector/Director/Output and separate AI Loader architecture.

## Short video Continue selections: E34 (2026-10-03)

Continue previously read 24 frames even when the selected source window was shorter than one second, so its last
guide image could come from beyond the chosen end. The compiler now limits that interval on the existing source frame grid.
NG accepts a single continuation guide image while retaining the five-frame minimum for video references.
The shared decoder has optional strict error propagation for NG; other Legacy callers keep their existing fallback.

Five new contracts cover short/long windows, single-frame guides, actual lossless frame-indexed decoding and invalid files.
368 integrated NG checks: 367 passed/one existing Windows symlink skip; Legacy 371/371 and 74/74, syntax/structure checks passed.
Weighted mixed API Run: 176.02 s, three chunks, 294 frames/392000 samples at 32 kHz, 12.25 seconds;
the actual native VAE guide equals the last selected source frame exactly, and both subsequent AV tails match exactly.
Browser edit/Save/Reload and native Run: 104.77 s, 294 frames, 12.25-second image/audio; actual submitted graph retains the window.
Saved example: `H3 NG - short video Continue E34`. Contexts still load files inside their cards; external native sampling is preserved.

This fixes the source selection for the existing last-source-frame guide, not the separate Last Frame continuity mode.
No motion/audio-tail extraction or perceptual quality acceptance is claimed. User server 8189 is preserved; activation of
this Python fix there requires its later restart. Sources and limits: `_notes/NG/28-video-continue-windows.md`, `experiments/e34_*`.
E30–E32 remain locally committed as `705bc72`; E33/E34 are uncommitted. No push, tag or publication.

## Shared assets, voice windows and Context text: E33 (2026-10-03)

Two Subjects share one image asset, video/soundtrack and scoped text; two independent Voice cards read different
windows from the same file. Native presentation contains four Pictures, paired Audio 1/Video 1 and Voice Audio 2/3.
All three chunks keep their IDs and labels. Actual reference audio lengths are 120/80/60 at H3's 40 Hz timebase.
The API render passed in 340.23 s: 294 frames, 392000 samples at 32 kHz, 12.25 seconds, exact previous AV tails.

Browser testing found that Subject rename updated Director idea/shots but left the old name in Context Text.
The Text editor now uses the existing stable-ID/casefold resolver and saves its previous name map in workflow properties.
The Inspector now counts each shared native Picture presentation in the budget instead of counting its card only once.
Regression tests reproduce both failures; Unicode, multi-word names, prefix boundaries and saved properties are covered.

Saved/reloaded example `H3 NG - shared assets two voices E33` keeps both asset owners, both voice windows and renamed text.
The corrected native browser Run passed in 244.311 s: 294 frames, 32-kHz audio, 12.25 seconds; all compiled prompts resolve.
One Director Output in the native loop, normal RandomNoise, CFGGuider CFG 1, two native samplers and direct file sources remain.
363 integrated NG checks: 362 passed/one existing Windows symlink skip; Legacy 371/371 and 74/74, five JS suites,
syntax/structure/Python checks passed. A stale model-list test was aligned with the concurrent registry-default behavior
using a local HTTP fixture; the provider implementation remains its owner's work.

Classic native memory loading is confined to the private test instance; the earlier aimdo 1450 issue remains unresolved.
Equal test images and short test WAVs establish routing and windows, not perceptual identity, voice quality or seams.
The private test server, tabs and lab junction were removed after its queue emptied; user 8189/PID 33504 is preserved.
E30–E32 remain locally committed as `705bc72`; E33 is uncommitted. Evidence and limits: `_notes/NG/27-shared-assets-and-voices.md`,
`experiments/e33_*`, `output/ng_lab/e33/e33_shared_*` and `e33_gui_00002_.mp4`.

## Local commit verification: E30–E32 (2026-10-03)

The Director changes were staged separately from the concurrent, uncommitted AI Loader refactor.
The exact staged source tree passed 279 NG checks (278 passed/one existing Windows symlink skip),
Legacy 371/371 and 74/74, all four JS logic suites, NG JS syntax and Python compilation.
Shared files contain only Subject ownership or native workflow-restoration changes in this snapshot;
the provider registry, requests, settings and branding remain in the working tree.
Earlier GPU/browser evidence below concerns the integrated development tree; no new render is claimed here.
Local evidence: `_notes/NG/experiments/e32_commit_manifest.json` and `e32_commit_*.log`.

## Subject assets and workflow compatibility: E32 (2026-10-03)

Simple image/video/text ownership is stored as optional v1 `subject_ids`. Grouped image references share a native
Subject while keeping their own `ng_item`/Picture ownership. Shared assets, card order, equal files, voice binding,
property preservation, mixed video/soundtrack/voice/text, caps, unavailable guides, presets and exact override are covered.
Actual installed H3 node/tokenizer checks cover two Subjects with a shared image and paired audio token order.
Fixed voice casefold and invalid text scopes after a Subject is dropped by the native reference budget.

Native widget restoration also preserves old AI Loader arrays after inserted numeric fields: defaults come from
the Python schema, original arrays are read before ComfyUI's positional migration, named values stay authoritative.
Six-field, Source-based, removed disk-switch and current formats are covered, including older still-running backends
and lazy legacy disk-provider arguments. No new AI request, model cache or second provider implementation.

318 NG checks: 317 passed/one existing Windows symlink skip; Legacy 371/371 and 74/74; core coverage 98.90%.
The suite includes concurrent provider work. Python/JS/structure checks passed; existing tests remain exercised.
Real native two-stage API render: 238.41 s, three chunks, CFG 1/normal RandomNoise, five file-loaded Contexts,
294 frames/392000 samples at 32 kHz, 12.25 seconds, exact previous video/audio tails in both continued chunks.
Browser checkbox assignment, rename, Save/Reload, old-format loading, canonical Inspector colors and native Run passed:
247.931 s, 294 frames, 12.25-second image/audio. Saved example: `H3 NG - subject assets E32 verified`.

The initial dynamic-loader run sampled three chunks but failed during Video VAE decode with Windows/aimdo error 1450
(`HostBuffer.read_file_slice failed`). Evidence is retained; successful functional runs use the classic native memory loader
only on the private test server (`--disable-dynamic-vram --disable-async-offload --disable-pinned-memory`).
This is an unresolved local native-loader issue, not a claimed NG/model-math fix. User 8189 is preserved.
Sources and precise limits: `_notes/NG/26-subject-assets.md`, `experiments/e32_*`, `output/ng_lab/e32/e32_assets_*`.
Independent Subjects without images, nested relationships, extracted multiple voices and perceptual/seam quality remain open.

## Editor and Inspector reference mapping: E31 (2026-10-03)

Fixed the two E30 display discrepancies: Unicode casefold aliases now highlight and rename with their stable context ID;
the Inspector uses canonical compiler `prompt_labels`, so Audio 1 belongs to the video soundtrack and Audio 2 to the voice.
Picture and Subject numbers use the planner's ownership mapping. Optional v1 display metadata roundtrips and loads older saves;
the still-running older backend has a narrow refs-based display path reading actual `context_options` JSON.
Browser Unicode folding matches Python across every scalar value, verified independently in JS and Python. No new dependency.

263 NG checks: 262 passed/one existing skip; Legacy 371/371 and 74/74; core coverage 98.69%; Python/JS/structure checks passed.
Actual browser rename, Save/Reload, three Inspector views and native two-stage Run passed: 294 frames, 12.25-second video/audio,
120.622 s. An additional mixed image/video-soundtrack/voice/text native two-stage run passed in 100.58 s with canonical labels
and exact prior AV pins in all continued chunks. These are functional mapping checks, not perceptual quality acceptance.
Private 8191 only; the user server 8189 and concurrent UI work are preserved. File-only contexts and E27 sampling stay intact.
Evidence and current limits: local `_notes/NG/25-ui-reference-mapping.md` and `experiments/e31_*`.

## Shared media files keep their own card identity: E29 (2026-10-03)

A file may be reused by several context cards. Each card now keeps its own identity, source window and role instead of
adopting the first card that pointed at that file. Prompt labels are numbered in the order the media actually reach
the model: all videos, then the soundtrack of each video that carries audio, then standalone audio cards. A video
with a soundtrack is declared as `<Audio N> is the soundtrack of <Video N>` and takes that number before a subject's
voice. `@Name` in idea, shots and text rules resolves to the label of the specific card, so two cards on one video no
longer swap labels.

Three failures were reproduced first (two video cards on one file lost the second window; the first audio card's trim
leaked onto a subject's voice; soundtrack and standalone voice both claimed `<Audio 1>`), then fixed and re-measured.
The old `source_shared` warning no longer describes the old behaviour as intended.

253 NG tests: 252 passed/one existing Windows symlink skip. Legacy 371/371 and 74/74; core line coverage 98.66%;
Python compile, JS syntax and JS logic checks passed.

Four actual H3 GPU variants on the installed int8 model at 256x256/four Euler steps/CFG 1, twelve seconds in three
chunks, each with real weights and file-loaded image/video/audio/text contexts: mixed references 122.53 s, two sampler
stages 97.00 s, duplicate files on several cards 154.33 s, Render Sequence 98.25 s. Every variant delivered 294 frames
and 392000 audio samples at 32 kHz; every continued chunk matched the previous latent tail exactly for video and audio;
the duplicate-file run kept both card IDs and their separate windows and declared the soundtrack before the voice.

These are functional and mapping checks at low resolution. Listening, seam quality, long-chain identity and multiple
seeds remain unmeasured. Full current evidence: local `_notes/NG/23-media-identity.md` and `experiments/e29_*`.

## Unicode compiler mentions: E30 (2026-10-03)

Fixed three reproduced image/video/audio compiler exceptions caused by inconsistent regex and name folding.
One shared resolver follows Unicode casefold name equivalence, resolves expansions such as Straße/STRASSE, and preserves
unknown aliases instead of crashing. Distinct dotted-I/ASCII names stay distinct. All four media types and chunk boundaries are tested.
257 NG checks: 256 passed/one existing skip; Legacy 371/371 and 74/74; core coverage 98.66%.
An actual mixed-reference H3 render and browser Save/Reload/two-stage Run passed at 256×256/four Euler steps/CFG 1:
294 frames and 12.25-second video/audio, with exact measured prior AV pins in the instrumented API loop.
The draft highlighting and Inspector audio tooltip/color discrepancies observed here were subsequently fixed in E31 above.
See local `_notes/NG/24-unicode-mentions.md` for evidence and limits. File-only contexts and E27 sampling are unchanged.

## File contexts, native media labels and workflow reload: E29 (2026-10-03)

Context Image/Video/Audio use file selection/upload in their own cards; the user rejected extra native media inputs.
E27 sampling stays intact. Fixed three reproduced media bugs: distinct cards using the same video file lost their identity,
Voice inherited another audio card's trim, and paired video audio displaced standalone Voice labels in H3's actual presentation.
Compilation now retains card identity and resolves Video/Audio mentions against retained references; manual prompt override stays untouched.

Fixed the reported `ng_product_nodes.js` configure crash when refreshed JS expects a sigma-shift widget absent from the
still-running Python backend. The real extension reproduces the pre-fix exception; regression checks cover missing widgets,
old placeholder migration and preserved explicit false. Original workflow Save/Reload works with the unchanged old backend.

253 NG checks: 252 passed/one existing skip; Legacy 371/371 and 74/74; core coverage 98.66%; Python/JS/structure checks passed.
Four actual H3 GPU variants with image/video/paired audio/voice/text passed: one/two native samplers, duplicate source cards,
and Render Sequence. Each delivered 294 frames/392000 audio samples at 32 kHz. Open loops verified reference labels/windows
and exact prior AV pins. A file-only two-stage frontend graph also saved, reloaded and rendered successfully, preserving disabled shifts;
its MP4 has 294 frames and 12.25-second video/audio tracks. No perceptual quality or upscaler approval follows from these checks.
Full local evidence: `_notes/NG/23-media-identity-and-prompt-labels.md` and `experiments/e29_*`.

## One Director Output and native RandomNoise: E27 (2026-10-03)

The Director supplies the ordered chunks before the native loop. A single Director Output inside it prepares the current
MODEL, conditioning, AV latent and seed; Prepare Chunk is removed. RandomNoise and KSampler receive that chunk seed directly.
Original result/Output slots and the simple Render Sequence path remain available. The two editable loop examples use this topology.

Actual H3 GPU checks passed for one/two native sampling stages, ordinary KSampler, six chunks, Turbo LoRA, Ref2VA, audio lock
and all continuity modes. Native interrupt and recovery succeeded. The frontend saved, reopened and rendered the two-stage graph;
its submitted loop body includes Output and RandomNoise and keeps Director/Collect outside. Director.sigma shifts stay disabled
when an upstream native Sigma Shift is connected.

At 256×256/four Euler steps/CFG 1, six chunks delivered 719 frames and 958667 audio samples at 32 kHz.
Continued video/audio pins matched the previous latent tails exactly. Fixed-seed one-stage/KSampler/packaged outputs matched
in the recorded decoded comparison; two stages differed. No upscale or perceptual seam/identity acceptance is established.
246 NG tests: 245 passed/one existing Windows symlink skip. Legacy 371/371 and 74/74; core line coverage 98.34%; Python/JS checks passed.
Full current evidence: local `_notes/NG/21-single-director-output.md` and `experiments/e27_*`.

## Historical editable sampling: E26 (2026-10-03)

The E26 topology below was replaced by E27; its measurements remain evidence for that earlier revision.

In E26, Director Output supplied the chunk list directly. Prepare Chunk built current conditioning, AV latent and native noise/seed
inside one native List loop. Supplied examples contain one or two editable SamplerCustomAdvanced stages; Render Sequence remains available.
Actual H3 GPU checks passed for these stages, ordinary KSampler, six chunks, Turbo LoRA, Ref2VA, audio lock and all continuity modes.
Interrupt stops the native job; recovery succeeds without restarting. The frontend saved, reopened and rendered the two-stage graph.

At 256×256/four Euler steps/CFG 1, the six-chunk sample delivered 719 frames and 958667 audio samples at 32 kHz.
Every continued video/audio pin matched its previous latent tail exactly; source audio lock suppresses the audio pin as intended.
The fixed-seed one-stage, KSampler and packaged outputs matched in this test; the two-stage result differed.
Audio lengths now use absolute frame boundaries, and Collect owns decoder outputs across later calls.
245 NG tests: 244 passed/one Windows symlink skip. Legacy 371/371 and 74/74; core line coverage 98.34%; Python/JS checks passed.

These are functional low-resolution checks, not perceptual seam/identity approval or learned-upscaler validation.
Exact scripts, histories and failure/method corrections are recorded in the supplied local development notes
`_notes/NG/20-external-sampling-validation.md` and `experiments/e26_*`.

## Requirements audit: E17

All nine product nodes were compared again with the original specification, user TXT and nine PNG references. E17 identified missing requirements. E18 implements and tests native CLIP/Disk assistance, distinct Audio/Text layouts, context colors and the compiler inspector. Full analysis/control modes, subject/asset relationships, remaining layouts and Last Frame continuity remain open in that audit. The earlier native-media-input proposal was superseded by the user's file-source decision in E28. Earlier passing suites establish only their tested scope.

## Native AI and layout evidence: E18

Installed `qwen3vl_4b_bf16.safetensors`, native CLIPLoader type `stable_diffusion`: connected CLIP text analysis, disk text analysis, image analysis and a complete 0–8 s scene proposal succeeded. Browser CLIP/Disk Analyze and Apply succeeded; edited input disabled stale Apply, Cancel interrupted its own prompt, and changing settings invalidated the tested badge. The AI prompt excludes H3 rendering nodes. This does not establish audio support or full video-motion understanding.

194 NG tests: 193 passed, one existing Windows symlink skip; core trace 98.03%. New checks cover native provider/context/connector packets, bounded settings/capabilities, graph expansion, prompt pruning, full scene timing and known names, color/label identity and normalized Inspector Context parity. Legacy 371/371 and 74/74 still pass. Nine separate UI views and Inspector Override/Rebuild/Raw were checked in ComfyUI. Default Image/Video/Director details still require scrolling; reference-layout acceptance remains partial. Full evidence lives in the local `_notes/NG/14-native-ai-layout.md` and `experiments/e18_*` records.

## Automated checks

- 186 NG checks: 185 passed, one Windows symlink-permission skip. Ordinary path containment checks pass.
- 98.01% executable core-line coverage from the standard-library trace runner; line coverage does not establish render quality.
- Legacy compiler 371/371 and nodes 74/74 rerun successfully. No Legacy behavior tests removed.
- Existing registration tests now assert the exact requested H3 Context display names and NG/Expert categories; all functional checks remain.
- Native output types, raw+lazy model links, closed expanded graphs, roles/Preserve/preset round trips, source ranges,
  timed guide placement, paired-video audio numbering and provider/Auto-Direct validation have new checks.
- Frontend logic checks include Connector traversal/provider-field whitelist, stable-ID rename, references, story editing and downstream progress.
- Structural guards, Python compilation, JS syntax and diff whitespace checks run before local completion. No new pip dependencies.

Run from the pack root with ComfyUI's Python:

```powershell
python tests/ng/run_tests.py
python tests/ng/coverage_core.py
python test_plan.py
python test_node.py
python -m compileall -q ng
```

## Native product runs: E15

ComfyUI 0.37.0/frontend 1.53.6, Python 3.12.10, Torch 2.9.1+cu130, RTX 5060 Ti 16 GB, 384×576, 8 steps, fixed seed 321
(recovery 322). Native loop/sampler/collector. Functional low-resolution checks; no claim of production image quality.

| Variant | Chunks | Frames | Video/audio seconds | Runtime | Progress/previews |
|---|---:|---:|---|---:|---:|
| text |2|192|8.000/8.000|99.5s|16/19|
| image + voice |2|192|8.000/8.000|127.7s|16/19|
| timed image guide |2|192|8.000/8.000|99.8s|16/19|
| music lock |2|192|8.000/8.000|97.1s|16/19|
| native sampler outputs |1|107|4.458/4.459|40.0s|8/8|
| video + paired audio |1|107|4.458/4.459|131.6s|8/10|
| last-video-frame continuation |1|107|4.458/4.459|50.5s|8/10|
| recovery after interruption |2|192|8.000/8.000|95.3s|16/19|

4 seconds rasterize to 107 frames on H3's grid, as the planning warning says. AAC container rounding can differ by about 1 ms.
An initial missing expanded chunk-graph edge was fixed; its failure history is retained. Invalid Video test usage was corrected before queueing.
Interrupt after two progress events ends without a final MP4. Recovery runs in the same process without restart.

Lock/source envelope correlation is 0.974 overall, 0.974/0.968 before/after the join; chroma similarity 0.994 overall, 0.994/0.992 per chunk.
These are sample metrics, not unchanged-waveform or perceptual listening results.
Sparse contact sheets were inspected: bakery hands/dough persist over this sample's join, and the reference figure remains recognizable.
The timed image guide changes the character/scene at the requested part of the video; smoothness is not established by those sparse frames.

## Product UI checks

Real browser checks cover compact/detail cards, native model/context/output connections, Source upload, image content/Preserve presets,
explicit mock-provider Analyze/Apply and Auto Direct/Apply, audio range drag/playback, video player/paired-audio choice,
Text quick insertion/template use and Director modes/scene editing. Requests use a local deterministic fixture, not an external paid service.
Asynchronous native upload previews are hidden per Context node because its workspace already has a media preview.
Scene time fields commit on input. Save/reload preserves the edited timing and Context IDs. Generate from the restored product workflow succeeds: 192 frames, video/audio 8.000 seconds, native iteration 2/2 and live preview.

Exact histories, scripts, MP4 paths, test logs, browser screenshots and product Save/Reload evidence are in the supplied local
`_notes/NG/experiments/e15_*` folder. New examples are editable normal ComfyUI workflows.


The Connector accepts a second Video Context through a real dragged cable, grows its next empty input and retains both video links after save/reload.
Extra empty restored tails are removed only on the NG Connector; connected slots and gaps before them remain intact.
Waveform Zoom reaches 400% without altering the source range. Compact labels and the separate AI source cards are readable.
The current AI Loader's timeout, token limit and keep-alive reach the transport for Analyze/Auto Direct; an older six-widget provider configuration is migrated on restore.
Configured providers are labeled *not tested*. Native CLIP selection now enables assistant actions when the actual encoder is connected. Successful native requests record action/medium; model/settings changes invalidate the badge. No provider request runs during load or rendering.
Layouts use ComfyUI DOM widget sizing; remaining default sizing/scroll issues are tracked as open requirements.

## Practical limits

No human listening assessment or calibrated imperceptible-seam criterion. Single-seed runs and sparse frame inspection cannot establish
identity/audio quality across arbitrary long videos. Existing multi-chunk experiments show possible audio high-frequency loss and action delay.
Preserve, structure and camera instructions guide H3; Video Continue uses a last-source-frame guide.
Adaptive continuity/crossfades, broad multi-seed quality and the full multi-asset relationship graph remain further research.

## Historical foundation evidence

The earlier M0–M11/E13 checks below remain valid for their original technical scope. They did not establish the later product interface.

## Fresh live evidence: E13

Environment: ComfyUI 0.37.0, frontend 1.53.6, Python 3.12.10, Torch 2.9.1+cu130, RTX 5060 Ti 16 GB. Native List loops,
`SamplerCustomAdvanced`, 384x576, 8 steps, fixed iteration seeds. These are functional checks at low resolution/steps.

| Run | Chunks | Frames | Video / audio container seconds | Runtime | Progress / preview events |
|---|---:|---:|---|---:|---:|
| Text with manual shots | 3 | 719 | 29.958 / 29.959 | 334 s | 24 / 28 |
| Image and voice | 2 | 481 | 20.042 / 20.042 | 239 s | 16 / 19 |
| Audio lock | 2 | 192 | 8.000 / 8.000 | 100 s | 16 / 19 |
| Automatic reference continuation | 5 | 1195 | 49.792 / 49.792 | 599 s | 40 / 46 |

All completed successfully; exact output frame counts match the plan. AAC decoder padding can increase the decoded audio buffer
by about 22-26 ms in the shorter MP4 checks; container duration and collector length are recorded separately.

Text joins: image-step ratios 1.53x / 0.67x; audio click ratios 4.11 / 0.07. Reference join: 4.87x image, 0.84 click.
Five-chunk chain: image ratios 3.69x / 5.44x / 4.02x / 4.62x, relative to its small median frame step (0.0026 normalized greyscale).
Audio level ratios after/before those joins are 0.29 / 0.12 / 0.36 / 0.39; click ratios 0.27 / 0.00 / 1.80 / 0.64.
These ratios describe this sample; they have no calibrated perceptual acceptance threshold.

Sparse contact sheets show the reference character and sanctuary persisting across the chain. The text-only project changes
the baker's appearance in its later shot. This is not a multi-seed identity guarantee. Audio-lock envelope correlation to the source
is 0.953 before and 0.963 after the join, best offset 0 ms on a 10 ms measurement grid. Listening has not been verified.

Interrupting after two progress events stops the native loop with `execution_interrupted`, no final MP4 and no pending jobs.
After a fresh interruption on the final backend, a browser-queued Audio-Lock render succeeds in the same process without restart:
192 frames, video/audio 8.000 s, 94 s runtime. The UI shows iteration 1/2, sampling progress and the sampling preview.
The installed rgthree progress extension labels a generated inner-loop node `???` and can show over 100%; this is not used as
an NG correctness measure. Native sampling progress and the loop iteration label are checked separately.
The browser verifies saved presets, explicit local mock-provider analysis and Apply, all inspector modes, and persisted provider,
mode, identity and colour after workflow reload. Reload does not call the provider automatically.

Full histories, event traces, scripts, contact sheets and exact local output paths are kept in the supplied development folder
`_notes/NG/experiments/e13_*`. The local mock fixture is reproducible with `e13_mock_provider.py`; it is not an installed provider.
