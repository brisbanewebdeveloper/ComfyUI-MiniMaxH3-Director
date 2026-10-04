import asyncio
import json
import unittest

from _pack import module

h3 = module("ng.adapters.h3_prompt")
native_ai = module("ng.adapters.native_ai")


class H3PromptNote(unittest.TestCase):
    """The Text card's AI button: a note in any language becomes the English H3 block."""

    def test_the_note_is_sent_whatever_language_it_is_written_in(self):
        prompt = h3.note_prompt("Ein Mädchen spielt mit einem roten Ball.", 8, "global")
        self.assertIn("Ein Mädchen spielt mit einem roten Ball.", prompt)
        self.assertIn("8.0 second", prompt)

    def test_the_duration_the_model_accepts_is_the_duration_it_is_told(self):
        # 4-15 seconds is the range the model's own prompt-writing guide states.
        for outside in (3.9, 15.1, 0):
            with self.subTest(seconds=outside):
                with self.assertRaises(ValueError):
                    h3.note_prompt("a girl plays", outside, "global")
        for inside in (4, 8, 15):
            with self.subTest(seconds=inside):
                self.assertIn("%.1f second" % inside, h3.note_prompt("a girl plays", inside, "global"))

    def test_an_empty_note_is_refused_before_any_request(self):
        with self.assertRaises(ValueError):
            h3.note_prompt("   \n ", 8, "global")

    def test_storyboard_asks_for_shot_markers_and_global_does_not(self):
        self.assertIn("[Shot N]", h3.note_prompt("a girl plays", 8, "storyboard"))
        self.assertNotIn("[Shot N]", h3.note_prompt("a girl plays", 8, "global"))

    def test_the_two_block_names_mean_the_same_on_the_card_and_in_the_enhance_node(self):
        # The card says "global"/"storyboard"; the enhance node spells the same two blocks out. A name
        # that only existed on one side would silently fall back to the global system prompt.
        for short in ("global", "storyboard"):
            self.assertIn(h3.preset_of(short), h3.PRESETS)
        self.assertEqual(h3.preset_of("global"), "global (scene + style)")
        self.assertEqual(h3.preset_of("storyboard"), "storyboard (shots + timings)")
        # An unknown name lands on the global block rather than on a prompt that does not exist.
        self.assertEqual(h3.preset_of("typo"), h3.preset_of("global"))

    def test_the_answer_keeps_no_section_labels_and_no_reference_tags(self):
        # The Director's compiler owns the structure and the numbering. An answer that carried its own
        # would nest structure inside structure and renumber the media cards' references, which is the
        # collision minimax_enhance exists to prevent - so it is cleaned with the same guards.
        answer = ("subject_definitions:\n<Subject 1> is a girl.\n\n"
                  "detailed_description: A girl plays with a red ball.\n"
                  "overall_soundscape: Room tone.\n\nnon_diegetic_music: N/A")
        cleaned = h3.clean(answer, "global")
        self.assertIn("A girl plays with a red ball.", cleaned)
        self.assertIn("Room tone.", cleaned)
        for label in ("subject_definitions", "detailed_description", "overall_soundscape",
                      "non_diegetic_music", "<Subject 1>"):
            self.assertNotIn(label, cleaned, "%s is the compiler's, not the model's" % label)

    def test_shot_markers_belong_to_the_storyboard_block_only(self):
        # The global block is one continuous description, so the timeline owns its shot markers and
        # timestamps; the storyboard block carries them. Both are cleaned by the enhance node's own
        # rules, so the card cannot end up with a shot list the compiler would write a second time.
        answer = "detailed_description: [Shot 1] A girl plays. [Shot 2] At 00:04.000, she stops."
        self.assertNotIn("[Shot 1]", h3.clean(answer, "global"))
        storyboard = h3.clean(answer, "storyboard")
        self.assertIn("[Shot 1] A girl plays.", storyboard)
        self.assertIn("[Shot 2] At 00:04.000,", storyboard)
        self.assertNotIn("At 00:04.000, [Shot 1]", storyboard,
                         "the first shot carries no timestamp of its own")

    def test_the_two_audio_lines_survive_the_cleaning(self):
        # overall_soundscape and non_diegetic_music are two of the three fields the H3 prompt is
        # built from, so an answer that lost its audio lines would arrive as a silent video.
        cleaned = h3.clean("A girl plays.\nAudio: Room tone.\nMusic: N/A", "global")
        self.assertIn("Audio: Room tone.", cleaned)
        self.assertIn("Music: N/A", cleaned)

    def test_an_empty_answer_says_so_instead_of_writing_an_empty_prompt(self):
        for blank in ("", "   \n  "):
            with self.subTest(answer=blank):
                with self.assertRaises(ValueError):
                    h3.clean(blank, "global")


class H3PromptAction(unittest.TestCase):
    """The action has to survive both transports: a connected CLIP and an HTTP provider."""

    def answer(self):
        return {"note": "Ein Mädchen spielt.", "seconds": 10, "preset": "storyboard"}

    def test_the_clip_request_asks_for_the_prompt_and_needs_no_media(self):
        prompt, media = native_ai.request_prompt("prompt", self.answer(), object())
        self.assertIn("Ein Mädchen spielt.", prompt)
        self.assertIn("[Shot N]", prompt)
        self.assertIsNone(media, "a text note sends no image or audio to the model")

    def test_the_clip_request_refuses_an_unknown_action(self):
        with self.assertRaises(ValueError):
            native_ai.request_prompt("rewrite", self.answer(), object())

    def test_the_clip_answer_is_cleaned_like_the_http_one(self):
        text = native_ai.parse_result("detailed_description: A girl plays.\nAudio: Room tone.",
                                       "prompt", json.dumps(self.answer()))
        # The card reads suggestion.prompt on both paths; a bare string reached it as "the AI answered without a prompt".
        self.assertEqual(set(text), {"prompt"})
        self.assertIn("A girl plays.", text["prompt"])
        self.assertNotIn("detailed_description", text["prompt"])

    def test_an_answer_with_only_sound_lines_is_refused_and_a_lone_label_keeps_its_text(self):
        # Real Qwen3-VL 4B answer to a global block: the labels alone, the sound below them, no description.
        raw = ("Audio:  \nWind sighs through broken glass panes.  \n\nMusic:  \nA lone cello line swells, then fades.")
        with self.assertRaisesRegex(ValueError, "only the sound lines"):
            native_ai.parse_result(raw, "prompt", json.dumps(self.answer() | {"preset": "global"}))
        cleaned = h3.clean("A woman sings in a dark hall.\n\nAudio:\nWind sighs.\nMusic:\nA cello swells.", "global")
        self.assertEqual(cleaned, "A woman sings in a dark hall.\nAudio: Wind sighs.\nMusic: A cello swells.")

    def test_an_echoed_request_is_named_as_such(self):
        # Real qwen3vl_4b_fp8_scaled output: the user's turn again, no answer.
        for action in ("prompt", "analyze"):
            with self.assertRaisesRegex(ValueError, "repeated the request"):
                native_ai.parse_result("user\nDescribe the supplied context text ...", action, json.dumps(self.answer() | {"media": "text"}))

    def test_a_text_card_analysis_gets_the_text_role_on_the_clip_path(self):
        # request_prompt names no medium to send for a note; the system prompt must still be the Text card's.
        sp = module("ng.core.system_prompts")
        config = module("ng.core.analysis").ProviderConfig(max_tokens=256)
        provider = module("ng.adapters.ai_provider").NativeAIProvider(["clip", 0], config)
        graph, _ = native_ai.native_request(provider, "analyze", json.dumps({"media": "text", "widgets": {"text": "No cuts.", "content": ""}}))
        system = next(node["inputs"]["system_prompt"] for node in graph.values() if node["class_type"] == "TextGenerate")
        self.assertEqual(system, sp.framed(sp.for_node("context", "text")))
        self.assertNotEqual(system, sp.framed(sp.for_node("context", None)))

    def test_the_clip_request_carries_no_schema_framing(self):
        # The other two actions answer with JSON that a parser reads. This one answers with prose that
        # goes into the prompt, so the JSON framing would turn it into something to parse back out.
        self.assertIn("Ein Mädchen spielt.", native_ai.request_prompt("prompt", self.answer(), object())[0])
        self.assertNotIn("JSON schema", native_ai.request_prompt("prompt", self.answer(), object())[0])

    def test_the_http_build_takes_the_short_names_the_card_sends(self):
        # The card sends "global"/"storyboard"; the server once checked only the long names and refused every build.
        legacy, sent = h3.legacy, []
        async def generate(images, prompt, provider, url, model, **options):
            sent.append(options["system_prompt"])
            return "A girl plays with a red ball."
        original, legacy.vlm_generate = legacy.vlm_generate, generate
        try:
            provider = {"schema_version": 1, "provider": "ollama", "base_url": "", "model": "m", "api_key_env": ""}
            for preset in ("global", "storyboard", h3.PRESETS[0]):
                with self.subTest(preset=preset):
                    answer = asyncio.run(h3.build({"note": "Ein Mädchen spielt.", "seconds": 8, "preset": preset, "provider": provider}))
                    self.assertIn("red ball", answer["prompt"])
                    self.assertEqual(sent[-1], h3.enhance.system_for(h3.preset_of(preset), 0))
            with self.assertRaisesRegex(ValueError, "Choose"):
                asyncio.run(h3.build({"note": "x", "preset": "typo", "provider": provider}))
        finally:
            legacy.vlm_generate = original


if __name__ == "__main__":
    unittest.main()