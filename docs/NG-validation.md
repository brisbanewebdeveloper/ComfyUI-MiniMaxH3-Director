# H3 Director NG validation

Local product work on branch `ng`, based on the existing NG foundation. Public release remains 0.3.2; local 1.0.0 is unreleased.
No push, tag or publication. New user TXT/PNG references define the Connector/Director/Output and separate AI Loader architecture.

## Requirements audit: E17

All nine product nodes were compared again with the original specification, user TXT and nine PNG references. E17 identified missing requirements. E18 implements and tests native CLIP/Disk assistance, distinct Audio/Text layouts, context colors and the compiler inspector. Full analysis/control modes, native media inputs, subject/asset relationships, remaining layouts and Last Frame continuity remain open. Earlier passing suites establish only their tested scope.

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
