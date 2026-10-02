import base64
import io
import json
import os
import tempfile
import unittest
import wave
from unittest.mock import patch

from _pack import module, comfy_available, stub_prompt_server

core = module("ng.core.analysis")


class Suggestions(unittest.TestCase):
    def test_provider_roundtrip_and_unknown_credentials(self):
        config = core.ProviderConfig(model="local-model", vision=False, audio=True, api_key_env="MY_VLM_KEY")
        self.assertEqual(core.ProviderConfig.from_dict(config.to_dict()), config)
        for change in ({"provider": "magic"}, {"vision": "yes"}, {"audio": 1}, {"api_key": "secret"}, {"schema_version": 2}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                core.ProviderConfig.from_dict({**config.to_dict(), **change})
        for address in ("ftp://server", "http://name:key@server", "https://server?api_key=secret", "https://server#key"):
            with self.subTest(address=address), self.assertRaises(ValueError):
                core.ProviderConfig.from_dict({**config.to_dict(), "base_url": address})

    def test_json_fences_and_bad_suggestions(self):
        answer = '{"description":"A woman in a red coat.","content":"character"}'
        self.assertEqual(core.parse_suggestion("```json\n" + answer + "\n```"), core.parse_suggestion(answer))
        for text in (None, [], "not json", "[]", '{"description":"x"}', '{"description":"","content":"style"}', '{"description":"x","content":"made_up"}'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                core.parse_suggestion(text)

    def test_prompts_disclose_sampling_limits(self):
        self.assertIn("ordered stills", core.analysis_prompt("video", "motion"))
        self.assertIn("15 seconds", core.analysis_prompt("audio", "voice"))
        self.assertIn("context text", core.analysis_prompt("text", "rules"))


@unittest.skipUnless(comfy_available(), "ComfyUI is not importable")
class ProviderTransport(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from aiohttp import web
        from PIL import Image
        stub_prompt_server()
        self.adapter = module("ng.adapters.analysis")
        self.preview = module("ng.adapters.preview_media")
        self.directory = tempfile.TemporaryDirectory()
        self.path_patch = patch("folder_paths.get_input_directory", return_value=self.directory.name)
        self.path_patch.start()
        Image.new("RGB", (32, 32), "red").save(os.path.join(self.directory.name, "image.png"))
        with wave.open(os.path.join(self.directory.name, "sound.wav"), "wb") as stream:
            stream.setnchannels(1); stream.setsampwidth(2); stream.setframerate(16000)
            stream.writeframes(b"\x10\x00" * 16000 * 20)
        self.status, self.answer, self.requests = 200, '{"description":"red object","content":"object"}', []

        async def respond(request):
            self.requests.append((request.path, request.headers.get("Authorization"), await request.json()))
            if self.status != 200:
                return web.Response(status=self.status, text="request rejected")
            if request.path == "/api/generate":
                return web.json_response({"response": self.answer})
            return web.json_response({"choices": [{"message": {"content": self.answer}}]})

        app = web.Application()
        app.router.add_post("/v1/chat/completions", respond)
        app.router.add_post("/api/generate", respond)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.url = "http://127.0.0.1:%d" % site._server.sockets[0].getsockname()[1]
        self.key_patch = patch.object(self.adapter.legacy, "resolve_api_key", return_value="test-key")
        self.key_patch.start()

    async def asyncTearDown(self):
        await self.runner.cleanup()
        self.key_patch.stop(); self.path_patch.stop(); self.directory.cleanup()

    def payload(self, media="image", **provider):
        config = core.ProviderConfig(provider="custom", base_url=self.url + "/v1", model="mock", **provider)
        return {"media": media, "widgets": {"image": "image.png", "audio": "sound.wav", "text": "Keep a slow camera.", "content": "style"},
                "provider": config.to_dict()}

    async def test_vision_reuses_auth_and_normalizes_v1(self):
        result = await self.adapter.analyze(self.payload())
        self.assertEqual(result["description"], "red object")
        path, auth, body = self.requests[0]
        self.assertEqual((path, auth), ("/v1/chat/completions", "Bearer test-key"))
        self.assertEqual(body["messages"][0]["content"][1]["type"], "image_url")
        self.assertNotIn("test-key", json.dumps(body))

    async def test_ollama_and_text_without_vision(self):
        data = self.payload("text", vision=False)
        data["provider"]["provider"] = "ollama"
        data["provider"]["base_url"] = self.url
        await self.adapter.analyze(data)
        body = self.requests[0][2]
        self.assertEqual((body["images"], body["keep_alive"]), ([], 0))
        self.assertIn("Keep a slow camera", body["prompt"])

    async def test_audio_is_bounded_and_uses_wav_content(self):
        await self.adapter.analyze(self.payload("audio", audio=True))
        audio = self.requests[0][2]["messages"][0]["content"][1]
        self.assertEqual(audio["type"], "input_audio")
        with wave.open(io.BytesIO(base64.b64decode(audio["input_audio"]["data"])), "rb") as stream:
            self.assertEqual((stream.getframerate(), stream.getnframes()), (16000, 15 * 16000))

    async def test_capabilities_stop_before_network(self):
        for payload in (self.payload(vision=False), self.payload("audio")):
            with self.assertRaisesRegex(ValueError, "Enable"):
                await self.adapter.analyze(payload)
        self.assertEqual(self.requests, [])

    async def test_http_failures_and_malformed_answer(self):
        for status in (401, 403, 500):
            self.status = status
            with self.assertRaises(ValueError):
                await self.adapter.analyze(self.payload())
        self.status, self.answer = 200, "this is not JSON"
        with self.assertRaises(ValueError):
            await self.adapter.analyze(self.payload())

    async def test_media_previews_and_missing_files(self):
        image = self.preview.preview("image", "image.png")
        self.assertTrue(image["thumbnail"].startswith("data:image/jpeg;base64,"))
        audio = self.preview.preview("audio", "sound.wav")
        self.assertEqual((len(audio["peaks"]), audio["sampled_seconds"]), (80, 15.0))
        with self.assertRaisesRegex(ValueError, "missing"):
            self.preview.preview("image", "missing.png")
