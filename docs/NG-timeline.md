# Story and generation timeline contract

> **Studio (2026-10-04):** the in-node editor this page describes was replaced by the full-screen Studio
> ([guide](NG.md#the-studio)). Shots now move on a 0.1 s grid and are reordered by dragging one over another
> instead of earlier/later arrows; audio clips have their own lanes. The planner contract below is unchanged.

Story shots and generation chunks share one time axis covering both requested
and delivered duration. The requested end remains visible when H3's frame grid
extends or shortens output. Labels derive from integer frame counts at native
24 fps; sampled frames include the pinned head, delivered frames exclude it.
The existing planner remains the authority; this editor does not replan chunks.

Selecting a shot selects its card/bar and highlights chunks containing its stable
ID in the actual compiler preview, including carry/head intersections. Chunk
tooltips describe delivered time, sampled/head frames and participating shots.
After a story/timing edit the prior chunk plan is cleared until a new response
arrives; stale geometry must not look current.

Dragging a story bar moves it; dragging an edge resizes it within project bounds.
A cancelled gesture restores its initial data. Pointer coordinates use the DOM
track width (including ComfyUI zoom). Timeline selection preserves shot identity.
Earlier/later controls swap chronological neighbors, preserving each duration,
their intervening gap and all text/media/dialogue/locks/drafts. Overlapping or
invalid ranges are left unchanged with repair feedback. Manual editing remains
allowed for fields protected from AI. Reordering does not rewrite prose.

Required proofs: real planner frame boundaries for 10 seconds, 5+5 targets and
120 seconds/12 targets; UI geometry, selection/carry membership, stale clearing,
drag/resize/cancel, reorder identity and Save/Reload. GPU rendering is unnecessary
for this editor-only behavior. E45 audio placement/mixing and interior frame
anchors remain separate unfinished contracts; this change does not implement them.
