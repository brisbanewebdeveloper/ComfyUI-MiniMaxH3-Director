"""Shot anchors must become actual native guide rows, not project-boundary promises."""
import unittest
from unittest.mock import patch
from _pack import comfy_available, module, stub_prompt_server
from test_shot_scope_contract import plan, shot

ctx, opts = module("ng.core.context"), module("ng.core.context_options")
chunks, project = module("ng.core.chunks"), module("ng.core.project")
HAVE_COMFY = comfy_available()
if HAVE_COMFY:
    import torch
    stub_prompt_server()
    builder, media = module("ng.adapters.chunk_builder"), module("ng.adapters.media")
    native = module("minimax_core").core()
    from test_chunk_builder import empty_latent


def image(identity, **changes):
    return ctx.ContextItem(identity, identity, "image", identity + ".png", **changes)


class ShotGuides(unittest.TestCase):
    def test_interior_first_last_and_continue_use_real_shot_boundaries(self):
        video = ctx.ContextItem("v", "Video", "video", "v.mp4", length_s=10,
                                options=opts.ContextOptions(start_s=1, end_s=6))
        records = [shot("late", 6, 7.5, [("a", "first_frame"), ("b", "last_frame")])]
        result = plan(records, (image("a"), image("b")), 12, 5, chunks.ContinuityPlan())
        found = [(chunk, ref) for chunk, compiled in zip(result.plan.chunks, result.compiled) for ref in compiled.refs]
        self.assertEqual([(r.kind, r.ctx_id, r.start_f) for c, r in found], [("keyframe", "a", 59), ("keyframe", "b", 94)])
        self.assertNotIn("shot_boundary_role", {i.code for i in result.issues})
        result = plan([shot("late", 6, 8, [("v", "continue")])], (video,), 12, 5, chunks.ContinuityPlan())
        found = [(chunk, ref) for chunk, compiled in zip(result.plan.chunks, result.compiled) for ref in compiled.refs]
        self.assertEqual([(r.kind, r.start_f, r.trim_start_f, r.length_f) for c, r in found], [("continue_video", 59, 120, 24)])

    def test_a_keyframe_bound_to_a_shot_guides_its_start_unless_the_card_names_a_time(self):
        records = [shot("k", 4, 6, [("a", "keyframe")])]
        result = plan(records, (image("a", usage=("keyframe",)),), 10, 10)
        self.assertEqual([(r.kind, r.ctx_id, r.start_f) for r in result.compiled[0].refs], [("keyframe", "a", 96)], "placed in the Studio = the shot's start")
        timed = image("a", usage=("keyframe",), options=opts.ContextOptions(anchor_s=7))
        result = plan(records, (timed,), 10, 10)
        self.assertEqual([r.start_f for r in result.compiled[0].refs], [168], "an older card's own time still wins")

    def test_repeated_first_frame_binding_produces_two_distinct_guides(self):
        records = [shot("one", 1, 3, [("a", "first_frame")]), shot("two", 7, 9, [("a", "first_frame")])]
        result = plan(records, (image("a"),), 10, 10)
        self.assertEqual([(r.kind, r.ctx_id, r.start_f) for r in result.compiled[0].refs],
                         [("keyframe", "a", 24), ("keyframe", "a", 168)])

    def test_independent_shots_do_not_get_a_false_single_anchor_warning(self):
        records = [shot("one", 1, 3, [("a", "first_frame")]), shot("two", 7, 9, [("b", "first_frame")])]
        result = plan(records, (image("a"), image("b")), 10, 10)
        self.assertNotIn("anchor_multiple", {i.code for i in result.issues})
        self.assertEqual([r.start_f for r in result.compiled[0].refs], [24, 168])

    def test_normalized_overlap_and_end_clipping_control_anchor_time(self):
        records = [shot("one", 0, 4, []), shot("late", 3, 20, [("a", "first_frame"), ("b", "last_frame")])]
        result = plan(records, (image("a"), image("b")), 10, 10)
        self.assertEqual([(r.kind, r.start_f) for r in result.compiled[0].refs], [("keyframe", 96), ("keyframe", 239)])
        self.assertTrue({"shot_overlap", "shot_clipped"} <= {i.code for i in result.issues})

    def test_ref2va_subjects_survive_a_bound_opening_guide(self):
        records = [shot("one", 0, 8, [("a", "first_frame")])]
        result = plan(records, (image("a"), image("subject", usage=("reference",))), 8, 10)
        compiled = result.compiled[0]
        self.assertEqual(compiled.mode, "ref2va")
        self.assertEqual([(r.kind, r.ctx_id) for r in compiled.refs], [("picture", "subject"), ("keyframe", "a")])
        self.assertEqual(dict(compiled.prompt_labels)["<Picture 1>"], "subject")

    def test_binding_order_resolves_same_frame_conflicts_and_names_both_contexts(self):
        result = plan([shot("one", 3, 8, [("b", "first_frame"), ("a", "first_frame")])], (image("a"), image("b")), 8, 10)
        self.assertEqual([(r.kind, r.ctx_id, r.start_f) for r in result.compiled[0].refs], [("keyframe", "b", 72)])
        issue = next(i for i in result.issues if i.code == "anchor_multiple")
        self.assertIn("b", issue.text); self.assertIn("a", issue.text)

    def test_carry_heads_do_not_repeat_an_earlier_shot_boundary(self):
        result = plan([shot("one", 1, 8, [("a", "first_frame"), ("b", "last_frame")])],
                      (image("a"), image("b")), 12, 5, chunks.ContinuityPlan())
        found = [(chunk, ref) for chunk, compiled in zip(result.plan.chunks, result.compiled) for ref in compiled.refs]
        self.assertEqual(len(found), 2)
        self.assertEqual([(c.story_start_f - c.head_frames + r.start_f, r.ctx_id) for c, r in found], [(24, "a"), (191, "b")])
        self.assertTrue(all(r.start_f >= c.head_frames for c, r in found))

    def test_a_speaker_only_context_does_not_leak_a_guide_into_later_chunks(self):
        first = shot("one", 0, 3, [])
        first["spoken"] = [{"schema_version": 1, "speaker_id": "a", "text": "Hello."}]
        result = plan([first, shot("two", 6, 8, [])], (image("a", usage=("first_frame",)),),
                      12, 5, chunks.ContinuityPlan())
        self.assertFalse(result.compiled[1].refs)
        self.assertFalse(result.compiled[2].refs)

    def test_global_frame_slot_wins_a_conflict_with_a_bound_edge(self):
        records = [shot("one", 0, 8, [("bound", "first_frame")])]
        result = plan(records, (image("bound"), image("global", usage=("first_frame",))), 8, 10)
        self.assertEqual([(r.kind, r.ctx_id) for r in result.compiled[0].refs], [("first_frame", "global")])
        issue = next(i for i in result.issues if i.code == "anchor_multiple")
        self.assertIn("global", issue.text); self.assertIn("bound", issue.text)

    def test_fl2va_shot_opening_on_its_first_frame_starts_an_unpinned_part(self):
        # User plan (2026-10-11): three shots, each opening on its own picture. Inside a pinned part H3 took the picture as
        # the end of the running take and cut one frame later; a part of its own puts it on the trained frame 0.
        records = [shot("one", 0, 20, [("a", "first_frame")]), shot("two", 20, 40, [("b", "first_frame")]),
                   shot("three", 40, 60, [("c", "first_frame")])]
        pictures = tuple(image(k, usage=("first_frame",)) for k in "abc")
        result = plan(records, pictures, 60, 6.67, chunks.ContinuityPlan())
        parts = result.plan.chunks
        opening = [c for c in parts if not c.head_frames]
        self.assertEqual(len(opening), 3)
        self.assertTrue(all(c.head_frames == 22 for c in parts if c not in opening), "inside a shot the parts continue")
        starts = [s.start_f for s in module("ng.core.shots").parse_shots(result.context.shots_text, 1440)[0]]
        self.assertEqual([c.story_start_f for c in opening], starts, "each shot starts where its part starts")
        for chunk in opening:
            compiled = result.compiled[chunk.index]
            self.assertEqual(compiled.mode, "fl2va")
            self.assertIn(("first_frame", 0), [(r.kind, r.start_f) for r in compiled.refs])
        self.assertTrue(all(abs(start - 480 * k) <= 8 for k, start in enumerate(starts)))
        self.assertIn("opening_moved", {i.code for i in result.issues})
        self.assertNotIn("late_change", {i.code for i in result.issues})

    def test_ref2va_keeps_a_shot_first_frame_inside_the_running_part(self):
        records = [shot("one", 0, 20, []), shot("two", 20, 40, [("b", "first_frame")])]
        result = plan(records, (image("b", usage=("first_frame",)), image("s")), 40, 6.67, chunks.ContinuityPlan())
        self.assertEqual(sum(not c.head_frames for c in result.plan.chunks), 1)

    def test_repeat_continue_keeps_a_subsecond_source_window_and_saved_offsets(self):
        video = ctx.ContextItem("v", "Video", "video", "v.mp4", length_s=4,
                                options=opts.ContextOptions(start_s=2, end_s=2 + 1/24))
        records = [shot("one", 1, 3, [("v", "continue")]), shot("two", 7, 9, [("v", "continue")])]
        result = plan(records, (video,), 10, 10)
        compiled = result.compiled[0]
        self.assertEqual([(r.start_f, r.trim_start_f, r.length_f) for r in compiled.of_kind("continue_video")],
                         [(24, 48, 1), (168, 48, 1)])
        self.assertEqual(module("ng.core.compile").CompiledChunk.from_dict(compiled.to_dict()), compiled)


@unittest.skipUnless(HAVE_COMFY, "ComfyUI is not importable")
class NativeGuideRows(unittest.TestCase):
    def test_native_guide_at_first_delivered_frame_survives_the_pinned_head(self):
        class Encoder:
            def tokenize(self, prompt, **kwargs): return "tokens"
            def encode_from_tokens_scheduled(self, tokens): return [[torch.zeros(1, 1, 8), {}]]
        class VAE:
            def encode(self, images): return torch.full((1, 24, 1, 4, 4), float(images.mean()))
        records = [shot("one", 0, 107/24, []), shot("two", 107/24, 12, [("a", "first_frame")])]
        result = plan(records, (image("a"),), 12, 5, chunks.ContinuityPlan())
        result = project.plan_project(ctx.DirectorContext.from_dict({**result.context.to_dict(), "width": 64, "height": 64}),
                                      5, chunks.ContinuityPlan())
        previous = empty_latent(result.plan.chunks[0].sampled_frames)
        with patch.object(media, "load_picture", return_value=torch.full((1, 64, 64, 3), .5)):
            built = builder.build_chunk(project.jobs(result)[1], Encoder(), VAE(), previous=previous, mm=native)
        guides = built.positive[0][1]["minimax_keyframes"]
        self.assertEqual(sum(row["resolved_frame_index"] == 22 for row in guides), 1)
        self.assertEqual(sum("latent" in row for row in guides), 8)
        self.assertTrue(any("audio_latent" in row for row in guides))
        self.assertEqual(built.dropped_anchors, ())

    def test_actual_native_continue_and_image_guides_keep_exact_local_frame_indices(self):
        class Encoder:
            def tokenize(self, prompt, **kwargs): return "tokens"
            def encode_from_tokens_scheduled(self, tokens): return [[torch.zeros(1, 1, 8), {}]]
        class VAE:
            def encode(self, images): return torch.full((1, 24, 1, 4, 4), float(images.mean()))
        video = ctx.ContextItem("v", "Video", "video", "v.mp4", length_s=3)
        records = [shot("one", 6, 8, [("v", "continue"), ("b", "last_frame")])]
        result = plan(records, (video, image("b")), 12, 5, chunks.ContinuityPlan())
        result = project.plan_project(ctx.DirectorContext.from_dict({**result.context.to_dict(), "width": 64, "height": 64}),
                                      5, chunks.ContinuityPlan())
        previous = empty_latent(result.plan.chunks[0].sampled_frames)
        frames = torch.stack([torch.full((64, 64, 3), value) for value in (.1, .3, .6)])
        with patch.object(media, "load_picture", return_value=torch.full((1, 64, 64, 3), .8)), \
             patch.object(media, "load_video", return_value=frames):
            built = builder.build_chunk(project.jobs(result)[1], Encoder(), VAE(), previous=previous, mm=native)
        guides = [row for row in built.positive[0][1]["minimax_keyframes"] if row["resolved_frame_index"] >= 22]
        self.assertEqual([row["resolved_frame_index"] for row in guides], [106, 59])
        self.assertAlmostEqual(float(guides[0]["latent"].mean()), .8, delta=1/255)
        self.assertAlmostEqual(float(guides[1]["latent"].mean()), .6, delta=1/255)
        self.assertEqual(built.dropped_anchors, ())


if __name__ == "__main__":
    unittest.main()
