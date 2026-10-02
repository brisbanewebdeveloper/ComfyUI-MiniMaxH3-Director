import unittest
from _pack import module

ctx = module("ng.core.context")
checks = module("ng.core.context_checks")
project = module("ng.core.project")
chunks = module("ng.core.chunks")


class Diagnostics(unittest.TestCase):
    def test_discarded_roles_are_visible(self):
        items = (ctx.ContextItem("a", "Start A", "image", "a.png", usage=("first_frame",)),
                 ctx.ContextItem("b", "Start B", "image", "a.png", usage=("first_frame",)),
                 ctx.ContextItem("c", "Clip", "video", "c.mp4"),
                 ctx.ContextItem("d", "Sound", "audio", "d.wav", usage=("lock", "copy")))
        codes = {i.code for i in checks.check_context(ctx.DirectorContext(items=items, mode="fl2va"))}
        self.assertEqual(codes, {"anchor_multiple", "source_shared", "reference_disabled", "audio_roles"})

    def test_unknown_usage_is_not_remapped_and_pending_image_is_reported(self):
        items = tuple(ctx.ContextItem(str(n), media, media, "source", usage=("future",))
                      for n, media in enumerate(("audio", "video", "text")))
        pending = ctx.ContextItem("key", "Key", "image", "key.png", usage=("keyframe",))
        result = project.plan_project(ctx.DirectorContext(idea="A walk", items=items + (pending,)), 10,
                                      chunks.ContinuityPlan("none"))
        self.assertEqual(result.compiled[0].refs, ())
        self.assertNotIn("source", result.compiled[0].prompt)
        self.assertTrue({"usage_unknown", "usage_pending"} <= {i.code for i in result.issues})
