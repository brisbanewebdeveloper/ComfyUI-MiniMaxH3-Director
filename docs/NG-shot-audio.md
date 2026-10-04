# Shot audio placement

Copy/Lock source start/end select samples from the input file. For a Context
bound to a structured Shot, that selection starts at the normalized Shot start,
stops at the Shot end or source end, and restarts for each subsequent binding.
The original Context options and Shot IDs remain unchanged. Chunk intersections
include the pinned head; a carried clip advances its source trim instead of
restarting. Gaps and the extra frames beyond the final Shot remain generated.
Unbound Contexts and legacy timed text retain their project-origin behavior.
Existing conflicting-role diagnostics and first-supported-role priority remain.

Copy passes the selected waveform to native H3 as a reference, with
`partially_copy` and an explicit target interval in the compiled retention note.
Its MediaRef `start_f` reports that interval's sampled-clip offset. Copy is model
guidance and does not promise exact sample placement or an identical soundtrack.
Manual prompt override replaces those generated timing instructions. Overlapping
Copy guidance yields to Lock in its held intervals.
Lock places and adds the selected waveforms before the native audio VAE encode,
clamps the summed track to [-1, 1], and holds the union of their latent intervals
with the native sampling noise mask. Input mono is duplicated to stereo.
Lock preserves encoded sound through sampling; VAE decode is lossy and latent
intervals round outward, so it is not a lossless PCM splice.

Video continuity stays enabled. Audio carry stays enabled when locks begin
outside the pinned audio head; a lock intersecting that head takes priority and
suppresses its audio carry conditioning. When there are no more locks, normal
audio carry resumes. No custom sampler or output audio replacement is added.

Interior First/Last/Continue bindings are a separate open contract; their
existing `shot_boundary_role` warning remains until implemented and verified.

Validation: compiler/source-window/serialization tests, actual native audio
reference presentation, PCM mix/carry/mask tests and native GPU sampling through
both external Loop and Render Sequence. Synthetic tones verify placement and
mixing, not speech, music quality or subjective continuity.
