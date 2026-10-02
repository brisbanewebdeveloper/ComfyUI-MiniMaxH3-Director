# NG completion and validation

Local branch: `ng`. Baseline: `cb9b62b` (2026-10-02). No push, tag or publication.

The handover's RESUME file is stale: M7 and part of M8/M11 already exist. Baseline checks pass: 133 NG tests, 371 legacy compiler checks and 74 legacy node checks.

## Delivered implementation

1. Close the NG input-path containment gap; allow references in input subfolders.
2. M8: local, versioned context presets; stable context IDs and colours; bounded media previews.
3. M9/E10: explicit context analysis with provider settings, declared vision/audio capabilities, environment-variable keys, editable suggestions and mock-server tests. Reuse the legacy transport for text/vision.
4. M10: Simple/Guided/Expert presentation; keep manual shots and automatic continuation using the existing compiler. No invented AI shot generation.
5. M11: text and image/voice examples, updated guide, README, changelog and milestone records. Package metadata is now 1.0.0 as an unreleased local candidate,
   following the user's requested version jump after implementation. The published release remains 0.3.2. No push or tag.

## Acceptance

- Existing IDs and legacy workflows remain valid; no core ComfyUI changes.
- Structure guard, NG tests, legacy checks, Python compilation and JS syntax checks pass.
- Preset round trips, workflow reload, preview/render parity and provider failure paths are exercised.
- Run the real nodes through native loops; record history, fixed seeds, frame/audio lengths, joins, preview/progress and interruption.
- Inspect output frames and report audio measurements honestly. Listening is verified only if a listening-capable tool is available.

## Limits carried forward

Single-seed experiments establish feasibility, not a guarantee of imperceptible joins. Pinned audio can lose high frequencies across long chains.
Fresh NG runs exercised relocated boundaries, but a controlled comparison of action delay remains unverified. The supplied design spec is the long-term concept;
the agreed M0-M11 plan is the current delivery scope (scene cards, full timeline, AI Auto Direct and adaptive continuity remain later work).

## Automated checks (2026-10-02)

- NG: 158 tests, 157 passed, one skipped because Windows symlink creation needs privileges unavailable to that test. The ordinary path checks pass.
- Core executable-line coverage: 97.90%, measured with the included standard-library trace runner. This is line coverage, not proof of render quality.
- Legacy compiler: 371/371. Legacy nodes: 74/74. Existing node IDs remain unchanged.
- Python compilation, every NG JS module's syntax, frontend logic and architecture guard pass. No new pip dependencies.
- Preset atomic replacement, identity/colour/source round trips, malformed requests, missing files, declared capabilities, authentication errors and malformed provider output are tested.

Run with ComfyUI's Python environment from the pack root:

```powershell
python tests/ng/run_tests.py
python tests/ng/coverage_core.py
python test_plan.py
python test_node.py
python -m compileall -q ng
```

Node.js must be available for the frontend checks; the runner explicitly reports a skip if it is absent.

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

## Release state

The planned software scope is implemented locally. The 1.0.0 candidate carries the documented continuity limits; it must not be
advertised as perceptually seamless or broadly quality validated. Publishing remains explicitly unauthorized until the user asks for it.
