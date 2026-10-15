"""Continue keeps its exact frame guide and sends selected source sound through a native paired reference."""
import unittest

from _pack import module


class ContinueSoundtrack(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = module("ng.core.context")
        cls.options = module("ng.core.context_options")
        cls.project = module("ng.core.project")
        cls.chunks = module("ng.core.chunks")

    def plan(self, mode, sound):
        item = self.context.ContextItem("source", "Source", "video", "clip.mp4", usage=("continue",), length_s=8,
                                        options=self.options.ContextOptions(start_s=.5, end_s=3.5, video_audio=sound))
        context = self.context.DirectorContext(idea="Continue walking.", mode=mode, project_seconds=5, items=(item,))
        project = self.project.plan_project(context, 6, self.chunks.ContinuityPlan("video_audio", 22, 24))
        return self.project.jobs(project)[0]

    def test_auto_and_ref_keep_guide_and_pair_selected_video_sound(self):
        for mode in ("auto", "ref2va"):
            with self.subTest(mode=mode):
                job = self.plan(mode, "reference")
                self.assertEqual(job.compiled.mode, "ref2va")
                self.assertEqual(len(job.compiled.of_kind("continue_video")), 1)
                refs = job.compiled.of_kind("video")
                self.assertEqual([(r.ctx_id, r.trim_start_f, r.length_f) for r in refs], [("source", 12, 72)])
                self.assertIn("<Video 1>", job.compiled.prompt)
                self.assertFalse(any(i.code == "reference_disabled" for i in job.project.issues))

    def test_explicit_fl_warns_about_sound_but_keeps_continuation_frame(self):
        job = self.plan("fl2va", "reference")
        self.assertEqual(job.compiled.mode, "t2va")
        self.assertEqual(len(job.compiled.of_kind("continue_video")), 1)
        self.assertEqual(job.compiled.of_kind("video"), ())
        warnings = [i.text for i in job.project.issues if i.code == "reference_disabled"]
        self.assertTrue(any("continuation frame is used" in text and "soundtrack" in text for text in warnings), warnings)

    def test_ignore_keeps_auto_fl_without_video_reference(self):
        job = self.plan("auto", "ignore")
        self.assertEqual(job.compiled.mode, "t2va")
        self.assertEqual(len(job.compiled.of_kind("continue_video")), 1)
        self.assertEqual(job.compiled.of_kind("video"), ())


if __name__ == "__main__":
    unittest.main()
