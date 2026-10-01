import unittest

from _pack import comfy_available, module

HAVE_COMFY = comfy_available()
if HAVE_COMFY:
    import torch
    from comfy.nested_tensor import NestedTensor

chunks = module("ng.core.chunks")
collect = module("ng.adapters.collect")

RATE = 32000


def fake_latent(frames, marker):
    video = torch.full((1, 24, ((frames - 5) // 17) * 5 + 2, 2, 2), float(marker))
    audio = torch.full((1, 32, 2, round(frames / 24.0 * 40)), float(marker))
    return {"samples": NestedTensor((video, audio))}


def decode_video_factory(frames_by_marker):
    def decode(video):
        marker = int(video.flatten()[0].item())
        return torch.full((frames_by_marker[marker], 4, 4, 3), float(marker))
    return decode


def decode_audio_factory(frames_by_marker, extra_samples=0):
    def decode(audio):
        marker = int(audio.flatten()[0].item())
        samples = int(round(frames_by_marker[marker] / 24.0 * RATE)) + extra_samples
        return {"waveform": torch.full((1, 2, samples), float(marker)), "sample_rate": RATE}
    return decode


@unittest.skipUnless(HAVE_COMFY, "ComfyUI is not importable")
class Collect(unittest.TestCase):
    def plan(self, total=600, window=22):
        return chunks.plan_chunks(total, 240, chunks.ContinuityPlan("video_audio", window, 24))

    def run_collect(self, plan, extra_samples=0):
        sizes = {c.index: c.sampled_frames for c in plan.chunks}
        latents = [fake_latent(c.sampled_frames, c.index) for c in plan.chunks]
        return collect.collect_chunks(latents, plan, decode_video_factory(sizes), decode_audio_factory(sizes, extra_samples))

    def test_length_equals_the_plan_and_sound_equals_picture(self):
        plan = self.plan()
        frames, audio, issues = self.run_collect(plan)
        self.assertEqual(frames.shape[0], plan.total_frames)
        self.assertEqual(audio["waveform"].shape[-1], round(plan.total_frames / 24.0 * RATE))
        self.assertEqual(issues, ())

    def test_pictures_and_sound_come_from_the_delivered_parts(self):
        plan = self.plan()
        frames, audio, _ = self.run_collect(plan)
        edge = 0
        for chunk in plan.chunks:
            self.assertEqual(int(frames[edge, 0, 0, 0].item()), chunk.index)
            sample = int(round(edge / 24.0 * RATE))
            self.assertEqual(int(audio["waveform"][0, 0, sample].item()), chunk.index)
            edge += chunk.delivered_frames

    def test_overlong_sound_is_cut_and_short_sound_is_padded_and_reported(self):
        plan = self.plan()
        frames, audio, issues = self.run_collect(plan, extra_samples=300)
        self.assertEqual(audio["waveform"].shape[-1], round(frames.shape[0] / 24.0 * RATE))
        _, audio, issues = self.run_collect(plan, extra_samples=-300)
        self.assertEqual(audio["waveform"].shape[-1], round(plan.total_frames / 24.0 * RATE))
        self.assertTrue(issues and issues[0].code == "audio_short")

    def test_wrong_number_of_chunks_or_frames_is_refused(self):
        plan = self.plan()
        sizes = {c.index: c.sampled_frames for c in plan.chunks}
        with self.assertRaises(ValueError):
            collect.collect_chunks([fake_latent(124, 0)], plan, decode_video_factory(sizes), decode_audio_factory(sizes))
        wrong = dict(sizes)
        wrong[0] = sizes[0] - 17
        latents = [fake_latent(c.sampled_frames, c.index) for c in plan.chunks]
        with self.assertRaises(ValueError):
            collect.collect_chunks(latents, plan, decode_video_factory(wrong), decode_audio_factory(sizes))


if __name__ == "__main__":
    unittest.main()
