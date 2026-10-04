"""Turbo is the official H3 recipe: a few-step LoRA on the model, nothing else changes in the graph."""
import unittest

from _pack import comfy_available, load_full_pack
import test_product_nodes


@unittest.skipUnless(comfy_available(), "ComfyUI is not importable")
class Turbo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nodes = load_full_pack().NODE_CLASS_MAPPINGS
        cls.helper = test_product_nodes.ProductNodes()
        cls.helper.nodes = cls.nodes

    def result(self, **turbo):
        director = self.nodes["NGH3Director"]
        values = dict(context=self.helper.packet(), idea="A baker opens a shop.", shots="", project_seconds=8.0,
                      chunk_seconds=5.0, width=384, height=576, mode="auto", continuity="video_audio", pin_frames="22",
                      soundscape="Wind", music="N/A", seed=123, steps=4, sampler_name="res_multistep",
                      scheduler="simple", shift_video=12.0, shift_audio=3.0, **turbo)
        return director.execute(**values).args[0]

    def loras(self, expand):
        return {value["inputs"]["model"][0]: value["inputs"]["lora_name"]
                for value in expand.values() if value["class_type"] == "LoraLoaderModelOnly"}

    def test_director_offers_turbo_after_every_earlier_widget(self):
        names = [item.id for item in self.nodes["NGH3Director"].GET_SCHEMA().inputs]
        start = names.index("turbo")
        self.assertEqual(names[start:start + 3], ["turbo", "turbo_lora_fl2va", "turbo_lora_ref2va"])
        self.assertEqual(names[start - 1], "shift_audio")
        combo = self.nodes["NGH3Director"].GET_SCHEMA().inputs[start + 2]
        self.assertEqual(combo.options[0], "none")

    def test_render_sequence_puts_each_lora_on_its_own_model(self):
        result = self.result(turbo=True, turbo_lora_fl2va="fl.safetensors", turbo_lora_ref2va="ref.safetensors")
        render = self.nodes["NGProjectRender"].execute(sequence=result)
        self.assertEqual(self.loras(render.expand), {"fl": "fl.safetensors", "ref": "ref.safetensors"})
        conditioning = next(v for v in render.expand.values() if v["class_type"] == "NGChunkConditioning")["inputs"]
        lora_ids = {key for key, value in render.expand.items() if value["class_type"] == "LoraLoaderModelOnly"}
        self.assertEqual({conditioning["model_fl2va"][0], conditioning["model_ref2va"][0]}, lora_ids)
        steps = next(v for v in render.expand.values() if v["class_type"] == "BasicScheduler")["inputs"]["steps"]
        self.assertEqual(steps, 4)

    def test_off_or_none_adds_no_lora(self):
        for turbo in ({}, {"turbo": False, "turbo_lora_fl2va": "fl.safetensors"}, {"turbo": True, "turbo_lora_fl2va": "none", "turbo_lora_ref2va": "none"}):
            with self.subTest(turbo=turbo):
                render = self.nodes["NGProjectRender"].execute(sequence=self.result(**turbo))
                self.assertEqual(self.loras(render.expand), {})

    def test_director_output_hands_the_turbo_model_to_an_external_sampler(self):
        result = self.result(turbo=True, turbo_lora_fl2va="fl.safetensors", turbo_lora_ref2va="none")
        output = self.nodes["NGDirectorOutput"].execute(result=result, chunk_index=0)
        self.assertEqual(self.loras(output.expand), {"fl": "fl.safetensors"})
        conditioning = next(v for v in output.expand.values() if v["class_type"] == "NGChunkConditioning")["inputs"]
        self.assertEqual(conditioning["model_ref2va"], ["ref", 0])


if __name__ == "__main__":
    unittest.main()
