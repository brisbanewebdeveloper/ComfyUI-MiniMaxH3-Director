"""H3 Control Video: each render part gets its own window of the control video, its pinned head included."""
import types
import unittest

from _pack import comfy_available, module

HAVE_COMFY = comfy_available()
if HAVE_COMFY:
    import torch
    control = module("ng.adapters.control")
    chunks = module("ng.core.chunks")


def job(story_start, delivered, head):
    return types.SimpleNamespace(chunk=chunks.Chunk(index=1, story_start_f=story_start, delivered_frames=delivered, head_frames=head))


class FakeCore:
    def __init__(self):
        self.calls = []
        outer = self

        class Apply:
            @staticmethod
            def execute(**kw):
                outer.calls.append(kw)
                return types.SimpleNamespace(args=("patched",))
        self.MiniMaxH3FunControlNetApply = Apply


@unittest.skipUnless(HAVE_COMFY, "ComfyUI is not importable")
class Window(unittest.TestCase):
    def test_a_continued_part_gets_its_head_and_new_frames(self):
        frames = torch.arange(500).float().view(500, 1, 1, 1).expand(500, 2, 2, 3)
        part = control.part_frames(frames, job(241, 221, 22))
        self.assertEqual(part.shape[0], 243)
        self.assertEqual((float(part[0, 0, 0, 0]), float(part[-1, 0, 0, 0])), (219.0, 461.0))

    def test_a_short_video_ends_before_the_part(self):
        frames = torch.zeros(100, 2, 2, 3)
        self.assertIsNone(control.part_frames(frames, job(241, 221, 22)))
        self.assertEqual(control.part_frames(frames, job(0, 243, 0)).shape[0], 100, "ComfyUI holds the last frame")

    def test_apply_passes_the_windows_and_reads_the_source_only_with_a_mask(self):
        fake, frames = FakeCore(), torch.zeros(300, 2, 2, 3)
        self.assertEqual(control.apply(fake, "model", "patch", "vae", job(0, 243, 0), 1.0, 0.0, 1.0, control_video=frames,
                                       source_video=frames), "patched")
        self.assertEqual(fake.calls[-1]["control_video"].shape[0], 243)
        self.assertIsNone(fake.calls[-1]["source_video"])
        control.apply(fake, "model", "patch", "vae", job(0, 243, 0), 1.0, 0.0, 1.0, mask=torch.ones(300, 2, 2), source_video=frames)
        self.assertEqual((fake.calls[-1]["mask"].shape[0], fake.calls[-1]["source_video"].shape[0]), (243, 243))


if __name__ == "__main__":
    unittest.main()
