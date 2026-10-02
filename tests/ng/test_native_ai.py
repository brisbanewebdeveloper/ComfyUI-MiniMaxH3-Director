"""Native AI jobs consume CLIP links without pulling H3 render models into the job."""
import json
import unittest

from _pack import comfy_available, load_full_pack, module


@unittest.skipUnless(comfy_available(), "ComfyUI is not importable")
class NativeAI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nodes = load_full_pack().NODE_CLASS_MAPPINGS
        cls.adapter = module("ng.adapters.native_ai")

    def provider(self, **changes):
        values = dict(source="clip", clip=["encoder", 0], provider="ollama", base_url="", model="",
                      api_key_env="", vision=True, audio=False, timeout_seconds=120, max_tokens=256, keep_alive=0)
        values.update(changes)
        return self.nodes["NGAIProvider"].execute(**values).args[0]

    def payload(self, media="text"):
        return json.dumps({"media": media, "widgets": {media: "Slow camera and consistent lighting.", "content": "rules"}})

    def test_loader_keeps_the_actual_unevaluated_clip_link(self):
        provider = self.provider()
        self.assertEqual(provider.clip, ["encoder", 0])
        self.assertEqual(provider.config.max_tokens, 256)
        with self.assertRaisesRegex(ValueError, "Connect a generative"):
            self.provider(clip=None)

    def test_expansion_uses_native_generate_text_and_bound_settings(self):
        self.assertTrue(self.nodes["NGAIRequest"].GET_SCHEMA().enable_expand)
        job = self.nodes["NGAIRequest"].execute(ai_provider=self.provider(), action="analyze", request_json=self.payload())
        kinds = {value["class_type"]: value["inputs"] for value in job.expand.values()}
        self.assertEqual(kinds["TextGenerate"]["clip"], ["encoder", 0])
        self.assertEqual(kinds["TextGenerate"]["max_length"], 256)
        self.assertEqual(kinds["TextGenerate"]["sampling_mode"], "off")
        self.assertIn("Slow camera", kinds["TextGenerate"]["prompt"])
        self.assertIn("NGAIResult", kinds)
        self.assertNotIn("SamplerCustomAdvanced", kinds)

    def test_local_disk_uses_native_clip_loader_without_loading_during_config(self):
        provider = self.provider(source="local", clip=None, local_backend="disk", local_model="qwen3vl_4b_bf16.safetensors")
        self.assertIsNone(provider.clip)
        job = self.nodes["NGAIRequest"].execute(ai_provider=provider, action="analyze", request_json=self.payload())
        kinds = {value["class_type"]: value["inputs"] for value in job.expand.values()}
        self.assertEqual(kinds["CLIPLoader"]["clip_name"], "qwen3vl_4b_bf16.safetensors")
        self.assertEqual(kinds["CLIPLoader"]["type"], "stable_diffusion")
        with self.assertRaisesRegex(ValueError, "Choose an installed"):
            self.provider(source="local", local_backend="disk", local_model="")

    def test_native_ai_packet_reaches_context_and_connector_without_generation(self):
        provider = self.provider()
        text = self.nodes["NGContextText"].execute(text="Slow camera.", name="Camera", description="",
                                                  content="rules", usage="rule", preserve="high", ai_provider=provider).args[0]
        packet = self.nodes["NGContextConnector"].execute(clip=["h3_clip", 0], vae=["vae", 0], audio_vae=["audio", 0],
                                                         model_fl2va=["fl2va", 0], ai_provider=provider,
                                                         context_text={"text_0": text}).args[0]
        self.assertIs(packet.ai_provider, provider)
        self.assertEqual(packet.clip, ["h3_clip", 0])
        self.assertEqual(provider.clip, ["encoder", 0], "AI and H3 conditioning must remain independent")

    def test_media_capabilities_and_response_validation_are_enforced(self):
        for media, options in (("image", {"vision": False}), ("audio", {"audio": False})):
            with self.subTest(media=media), self.assertRaisesRegex(ValueError, "Enable"):
                self.nodes["NGAIRequest"].execute(ai_provider=self.provider(**options), action="analyze", request_json=self.payload(media))
        with self.assertRaises(ValueError):
            self.nodes["NGAIResult"].execute(text="This isn't JSON", action="analyze", request_json=self.payload())
        result = self.nodes["NGAIResult"].execute(text='{"content":"rules","description":"Slow camera."}', action="analyze", request_json=self.payload())
        self.assertEqual(result.ui["ng_suggestion"][0]["description"], "Slow camera.")
        result = self.nodes["NGAIResult"].execute(text='assistant\n{"content":"rules","description":"Slow camera."}', action="analyze", request_json=self.payload())
        self.assertEqual(result.ui["ng_suggestion"][0]["content"], "rules")


if __name__ == "__main__":
    unittest.main()
