"""The native reference node keeps the selected video and paired audio window."""
import importlib
import unittest

from _pack import comfy_available, load_full_pack

HAVE_COMFY = comfy_available()
if HAVE_COMFY:
    import torch


@unittest.skipUnless(HAVE_COMFY, "ComfyUI unavailable")
class ReferenceWindow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pack = load_full_pack().__name__
        cls.native = importlib.import_module(pack + '.minimax_core').core()

    def run_reference(self, frames, audio_seconds):
        class Clip:
            def tokenize(self, prompt, **kwargs):
                self.items = kwargs['minimax_ref_items']
                return None
            def encode_from_tokens_scheduled(self, tokens):
                return [[torch.zeros(1, 1, 8), {}]]
        class VideoVAE:
            def encode(self, images):
                self.frames = images.shape[0]
                return torch.zeros(1, 24, ((self.frames + 16) // 17) * 5 - 3, 4, 4)
        class AudioVAE:
            audio_sample_rate = 32000
            def encode(self, wave):
                self.samples = wave.shape[1]
                return torch.zeros(1, 32, 2, (self.samples + 799) // 800)
        clip, video, audio = Clip(), VideoVAE(), AudioVAE()
        out = self.native.MiniMaxH3ReferenceToVideo.execute(
            clip=clip, vae=video, audio_vae=audio, prompt='A cube moves.', width=64, height=64, length=124,
            ref_videos={'ref_video_1': torch.zeros(frames, 64, 64, 3)},
            ref_video_audios={'ref_video_audio_1': {'waveform': torch.zeros(1, 2, 32000 * audio_seconds), 'sample_rate': 32000}})
        return clip, video, audio, out.args[0][0][1]['minimax_refs'][0]

    def test_all_72_selected_frames_reach_the_vae_and_qwen(self):
        clip, video, audio, block = self.run_reference(72, 3)
        self.assertEqual(video.frames, 72)
        self.assertEqual(block['latent_t'], 22)
        self.assertEqual(audio.samples, 96000)
        self.assertEqual(block['ref_audio_t'], 120)
        self.assertEqual(clip.items[1]['data'].shape[0], 6)
        self.assertEqual(clip.items[1]['timestamps'], [0, 0.5, 1, 1.5, 2, 2.5])

    def test_target_duration_limit_also_clips_the_paired_soundtrack(self):
        _, video, audio, _ = self.run_reference(158, 7)
        self.assertEqual(video.frames, 124)
        self.assertEqual(audio.samples, round(124 / 24 * 32000))

    def test_extra_soundtrack_tail_is_not_kept_past_the_selected_video(self):
        _, video, audio, _ = self.run_reference(72, 7)
        self.assertEqual(video.frames, 72)
        self.assertEqual(audio.samples, 96000)
