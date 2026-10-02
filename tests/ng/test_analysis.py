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

    def test_panel_settings_are_range_checked_and_defaulted(self):
        # The panel offers timeout, max_tokens and keep_alive, so the core has to hold their bounds.
        defaults = core.ProviderConfig.from_dict({"schema_version": 1})
        self.assertEqual((defaults.timeout_seconds, defaults.max_tokens, defaults.keep_alive), (120, 512, 0))
        self.assertEqual(core.ProviderConfig.from_dict({"schema_version": 1, "timeout_seconds": 30}).timeout_seconds, 30)
        for change in ({"timeout_seconds": 0}, {"timeout_seconds": 5000}, {"max_tokens": 12}, {"max_tokens": 99999},
                       {"keep_alive": -1}, {"timeout_seconds": 12.5}, {"timeout_seconds": "120"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                core.ProviderConfig.from_dict({"schema_version": 1, **change})

    def test_panel_only_field_is_not_part_of_the_saved_provider(self):
        # `source` steers the cards; a saved workflow must not carry it into the config.
        self.assertNotIn("source", core.ProviderConfig().to_dict())

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

    def test_a_suggestion_carries_its_reason_and_round_trips(self):
        # The panel shows why, so a provider that returns nothing for it must still produce a usable suggestion.
        answer = '{"description":"A woman in a red coat.","content":"character","why":"she fills the frame."}'
        parsed = core.parse_suggestion(answer)
        self.assertEqual(parsed.why, "she fills the frame.")
        self.assertEqual(core.AnalysisSuggestion.from_dict(parsed.to_dict()), parsed)
        bare = core.parse_suggestion('{"description":"A woman.","content":"character"}')
        self.assertEqual(bare.why, "", "a missing reason is allowed, a wrong one is not")
        for text in ('{"description":"x","content":"character","why":5}',
                     '{"description":"x","content":"character","usage":7}',
                     json.dumps({"description": "x" * 601, "content": "character", "why": "y" * 601})):
            with self.subTest(text=text[:40]), self.assertRaises(ValueError):
                core.parse_suggestion(text)
        # A model may answer with extra keys; that is not saved data, so it is ignored rather than refused.
        extra = core.parse_suggestion('{"description":"x","content":"character","schema_version":9,"tone":"warm"}')
        self.assertEqual(extra.description, "x")

    def test_only_filled_fields_are_offered(self):
        partial = core.parse_suggestion('{"description":"A woman.","content":"character"}')
        self.assertEqual(partial.offered(), {"description": "A woman.", "content": "character"})
        self.assertEqual(core.parse_suggestion('{"description":"A woman.","content":"character"}').offered().get("usage", None), None)
        empty = core.AnalysisSuggestion(description="A woman.")
        self.assertEqual(empty.offered(), {"description": "A woman."})


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
        config = core.ProviderConfig(**{"provider": "custom", "base_url": self.url + "/v1", "model": "mock", **provider})
        return {"media": media, "widgets": {"image": "image.png", "audio": "sound.wav", "text": "Keep a slow camera.", "content": "style"},
                "provider": config.to_dict()}

    async def test_vision_reuses_auth_and_normalizes_v1(self):
        result = await self.adapter.analyze(self.payload(max_tokens=1024, timeout_seconds=45))
        self.assertEqual(result["description"], "red object")
        path, auth, body = self.requests[0]
        self.assertEqual((path, auth), ("/v1/chat/completions", "Bearer test-key"))
        self.assertEqual(body["messages"][0]["content"][1]["type"], "image_url")
        self.assertEqual(body["max_tokens"], 1024)
        self.assertNotIn("test-key", json.dumps(body))

    async def test_ollama_and_text_without_vision(self):
        data = self.payload("text", vision=False, keep_alive=60)
        data["provider"]["provider"] = "ollama"
        data["provider"]["base_url"] = self.url
        await self.adapter.analyze(data)
        body = self.requests[0][2]
        self.assertEqual((body["images"], body["keep_alive"]), ([], 60))
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

    async def test_missing_address_and_model_stop_before_network(self):
        # A remote endpoint has no default and no model list, so both are named as a missing
        # setting rather than surfacing as a connection error against an empty address.
        with self.assertRaisesRegex(ValueError, "not a usable address"):
            await self.adapter.analyze(self.payload(base_url=""))
        with self.assertRaisesRegex(ValueError, "No model name set"):
            await self.adapter.analyze(self.payload(model=""))
        self.assertEqual(self.requests, [], "an unconfigured provider must not reach the network")

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

    async def test_full_waveform_has_duration_metadata_and_streamed_peaks(self):
        waveform = module("ng.adapters.waveform")
        data = waveform.envelope("sound.wav")
        self.assertEqual(data["duration_s"], 20.0)
        self.assertEqual((data["sample_rate"], data["channels"], len(data["peaks"])), (16000, 1, 320))
        self.assertGreater(data["peaks"][-1], 0)

    async def test_analyze_all_covers_usable_cards_and_names_the_rest(self):
        adapter = module("ng.adapters.analyze_all")
        base = self.payload(audio=True)
        payload = {"provider": base["provider"], "mode": "assist", "contexts": [
            {"media": "image", "widgets": base["widgets"]},
            {"media": "audio", "widgets": base["widgets"]},
            {"media": "text", "widgets": {"text": "  ", "name": "Empty"}},
            {"media": "image", "widgets": {"image": "", "name": "Blank"}}]}
        result = await adapter.analyze_all(payload)
        self.assertEqual([entry["index"] for entry in result["results"]], [0, 1])
        self.assertTrue(all(entry["ok"] for entry in result["results"]), result["results"])
        self.assertEqual(result["results"][0]["suggestion"]["description"], "red object")
        self.assertEqual(len(self.requests), 2, "only the usable cards reach the provider")
        self.assertEqual(len(result["skipped"]), 2)
        self.assertTrue(any("text is empty" in reason for reason in result["skipped"]))
        self.assertTrue(any("no file chosen" in reason for reason in result["skipped"]))

    async def test_an_undeclared_capability_is_a_result_not_a_crash(self):
        # The same card works with audio enabled and reports the reason here; the batch keeps its other results.
        adapter = module("ng.adapters.analyze_all")
        base = self.payload()
        payload = {"provider": base["provider"], "mode": "assist", "contexts": [
            {"media": "audio", "widgets": base["widgets"]},
            {"media": "image", "widgets": base["widgets"]}]}
        result = await adapter.analyze_all(payload)
        self.assertEqual([entry["ok"] for entry in result["results"]], [False, True])
        self.assertIn("Enable audio", result["results"][0]["error"])
        self.assertEqual(result["results"][1]["suggestion"]["description"], "red object")

    async def test_analyze_all_keeps_going_after_one_card_fails_and_says_so(self):
        adapter = module("ng.adapters.analyze_all")
        base = self.payload()
        payload = {"provider": base["provider"], "mode": "assist", "contexts": [
            {"media": "image", "widgets": base["widgets"]},
            {"media": "image", "widgets": {**base["widgets"], "content": "still fine"}}]}
        self.status = 500
        result = await adapter.analyze_all(payload)
        self.assertEqual([entry["ok"] for entry in result["results"]], [False, False])
        self.assertIn("same error", result["skipped"][-1].lower())

    async def test_analyze_all_respects_manual_mode_without_any_request(self):
        adapter = module("ng.adapters.analyze_all")
        base = self.payload()
        payload = {"provider": base["provider"], "mode": "manual",
                   "contexts": [{"media": "image", "widgets": base["widgets"]}]}
        result = await adapter.analyze_all(payload)
        self.assertEqual(result["results"], [])
        self.assertEqual(self.requests, [], "Manual must not contact the provider")

    async def test_auto_direct_uses_existing_transport_and_returns_a_proposal(self):
        adapter = module("ng.adapters.auto_direct")
        self.answer = json.dumps({"shots": [{"start_s": 0, "end_s": 8, "action": "Alice walks.", "camera": "Static", "dialogue": ""}],
                                 "soundscape": "wind", "music": "N/A"})
        payload = {"provider": self.payload("text", max_tokens=1024)["provider"], "director": {"idea": "Alice walks.", "project_seconds": 8}, "contexts": []}
        result = await adapter.direct(payload)
        self.assertIn("0.000-8.000: Alice walks.", result["shots"])
        self.assertEqual(self.requests[0][1], "Bearer test-key")
        self.assertEqual(self.requests[0][2]["max_tokens"], 1024)
        self.assertEqual(payload["director"], {"idea": "Alice walks.", "project_seconds": 8})
        self.answer = "malformed"
        with self.assertRaises(ValueError):
            await adapter.direct(payload)
