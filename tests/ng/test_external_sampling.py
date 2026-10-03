"""Contracts at the editable native loop's boundaries: selection, model shifts and full AV returns."""
import sys
import types
import unittest
from unittest.mock import patch

from _pack import comfy_available, load_full_pack

HAVE_COMFY = comfy_available()
if HAVE_COMFY:
    import torch
    from comfy.nested_tensor import NestedTensor
    from comfy_extras.nodes_custom_sampler import RandomNoise


def av_latent(frames):
    video = torch.zeros(1, 24, ((frames - 5) // 17) * 5 + 2, 4, 4)
    audio = torch.zeros(1, 32, 2, round(frames / 24.0 * 40))
    return {"samples": NestedTensor((video, audio))}


@unittest.skipUnless(HAVE_COMFY, "ComfyUI is not importable")
class ExternalSampling(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nodes = load_full_pack().NODE_CLASS_MAPPINGS
        cls.chunk_module = sys.modules["mmxd_full_pack.ng.nodes.chunk_node"]

    def director(self):
        packet = self.nodes["NGContextConnector"].execute(clip=["clip", 0], vae=["vae", 0], audio_vae=["audio", 0],
                                                          model_fl2va=["fl", 0]).args[0]
        return self.nodes["NGH3Director"].execute(context=packet, idea="A baker kneads dough.", shots="",
                                                project_seconds=12.0, chunk_seconds=5.0, width=64, height=64,
                                                mode="auto", continuity="video_audio", pin_frames="22",
                                                soundscape="Wind", music="N/A", seed=123, steps=8,
                                                sampler_name="euler", scheduler="simple", shift_video=12.0, shift_audio=3.0)

    def result(self):
        return self.director().args[0]

    def jobs(self, result):
        return self.nodes["NGProjectChunks"].execute(sequence=result).args[0]

    def test_director_provides_the_whole_list_without_evaluating_model_links(self):
        director = self.director()
        result, chunks = director.args
        out = self.nodes["NGDirectorOutput"].execute(result)
        self.assertIs(out.args[8], result)
        self.assertEqual([job.index for job in chunks], [0, 1, 2])
        self.assertTrue(all(job.project is result.project for job in chunks))
        self.assertEqual(result.inputs.model_fl2va, ["fl", 0])
        self.assertIsNone(director.expand)
        self.assertTrue(self.nodes["NGH3Director"].GET_SCHEMA().outputs[1].is_output_list)

    def test_single_output_prepares_conditioning_and_seed_for_native_random_noise(self):
        result = self.result()
        job = self.jobs(result)[1]
        for seed, expected in ((None, 124), (456, 457), (2**64 - 1, 0)):
            out = self.nodes["NGDirectorOutput"].execute(result, loop_chunk=job, previous=["start", 4], seed=seed, apply_sigma_shift=False)
            kinds = {n["class_type"]: (key, n["inputs"]) for key, n in out.expand.items()}
            self.assertEqual(set(kinds), {"NGChunkConditioning", "ConditioningZeroOut"})
            self.assertIs(kinds["NGChunkConditioning"][1]["chunk"], job)
            self.assertEqual(kinds["NGChunkConditioning"][1]["previous"], ["start", 4])
            self.assertFalse(kinds["NGChunkConditioning"][1]["apply_sigma_shift"])
            self.assertEqual(out.args[9], expected)
            noise = RandomNoise.execute(out.args[9]).args[0]
            wrapped_noise = self.nodes["NGChunkNoise"].execute(job, result.settings.seed if seed is None else seed).args[0]
            latent = av_latent(job.chunk.sampled_frames)
            for actual, reference in zip(noise.generate_noise(latent).unbind(), wrapped_noise.generate_noise(latent).unbind()):
                self.assertTrue(torch.equal(actual, reference))
        self.assertNotIn("NGPrepareChunk", self.nodes)

    def test_output_uses_each_loop_job_instead_of_the_manual_index(self):
        result = self.result()
        for job in self.jobs(result):
            out = self.nodes["NGDirectorOutput"].execute(result, chunk_index=9999, loop_chunk=job, previous=["start", 4])
            prepared = next(n for n in out.expand.values() if n["class_type"] == "NGChunkConditioning")["inputs"]
            self.assertIs(prepared["chunk"], job)
            self.assertEqual(prepared["previous"], ["start", 4])
            self.assertIs(out.args[8], result)

    def test_a_job_from_another_sequence_cannot_use_this_sequences_models_or_plan(self):
        with self.assertRaisesRegex(ValueError, "same Director"):
            self.nodes["NGDirectorOutput"].execute(self.result(), loop_chunk=self.jobs(self.result())[0])

    def test_loop_socket_is_evaluated_but_previous_remains_a_raw_expansion_link(self):
        inputs = {i.id: i for i in self.nodes["NGDirectorOutput"].GET_SCHEMA().inputs}
        self.assertEqual(inputs["loop_chunk"].io_type, "NG_CHUNK")
        self.assertTrue(inputs["loop_chunk"].optional)
        self.assertFalse(inputs["loop_chunk"].rawLink)
        self.assertTrue(inputs["previous"].rawLink)

    def test_model_shift_override_is_forwarded_without_changing_old_defaults(self):
        for enabled in (True, False):
            out = self.nodes["NGDirectorOutput"].execute(self.result(), apply_sigma_shift=enabled)
            prepared = next(n for n in out.expand.values() if n["class_type"] == "NGChunkConditioning")["inputs"]
            self.assertIs(prepared["apply_sigma_shift"], enabled)

    def test_disabled_shift_preserves_the_patched_model_and_default_still_applies_shift(self):
        job, model = self.jobs(self.result())[0], object()
        built = types.SimpleNamespace(positive=[[torch.zeros(1, 2, 8), {}]], latent=av_latent(job.chunk.sampled_frames))
        shift = types.SimpleNamespace(execute=lambda **kw: types.SimpleNamespace(args=("shifted",)))
        fake_core = types.SimpleNamespace(MiniMaxH3SigmaShift=shift)
        with patch.object(self.chunk_module, "core", return_value=fake_core), \
                patch.object(self.chunk_module.chunk_builder, "build_chunk", return_value=built):
            for enabled, expected in ((False, model), (True, "shifted")):
                out = self.nodes["NGChunkConditioning"].execute(job, object(), object(), model_fl2va=model, apply_sigma_shift=enabled)
                self.assertIs(out.args[0], expected)

    def test_missing_or_trimmed_continuity_latent_fails_before_conditioning(self):
        job = self.jobs(self.result())[1]
        with patch.object(self.chunk_module, "core") as core:
            with self.assertRaisesRegex(ValueError, "previous full AV latent"):
                self.nodes["NGChunkConditioning"].execute(job, object(), object())
            previous_frames = job.project.plan.chunks[0].sampled_frames
            with self.assertRaisesRegex(ValueError, "full.*frame AV latent"):
                self.nodes["NGChunkConditioning"].execute(job, object(), object(), previous=av_latent(previous_frames - 17))
            core.assert_not_called()

    def test_collector_rejects_reordered_jobs(self):
        jobs = self.jobs(self.result())
        with self.assertRaisesRegex(ValueError, "ordered Project Chunks"):
            self.nodes["NGCollect"].execute([], jobs[::-1], [], [])

    def test_collector_rejects_trimmed_audio_before_decoding(self):
        plan = self.result().project.plan
        returned = [av_latent(c.sampled_frames) for c in plan.chunks]
        video, audio = returned[-1]["samples"].unbind()
        returned[-1] = {"samples": NestedTensor((video, audio[..., :-40]))}
        with self.assertRaisesRegex(ValueError, "full.*frame AV latent"):
            self.chunk_module.collect.collect_chunks(returned, plan, lambda v: torch.zeros(plan.chunks[0].sampled_frames, 4, 4, 3),
                                                     lambda a: {"waveform": torch.zeros(1, 2, 200000), "sample_rate": 32000})

    def test_direct_pin_rejects_changed_canvas_with_an_actionable_message(self):
        with self.assertRaisesRegex(ValueError, "same-resolution continuity"):
            self.chunk_module.latents.check_same_canvas(torch.zeros(1, 24, 37, 4, 4), torch.zeros(1, 24, 37, 8, 8))


if __name__ == "__main__":
    unittest.main()
