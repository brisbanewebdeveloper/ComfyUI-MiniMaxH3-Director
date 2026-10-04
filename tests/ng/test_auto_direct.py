import json
import unittest

from _pack import module

direction = module("ng.core.auto_direct")


class SceneSuggestion(unittest.TestCase):
    def answer(self):
        return {"shots": [{"start_s": 0, "end_s": 4, "action": "@Alice enters.", "camera": "Slow dolly", "dialogue": ""},
                          {"start_s": 4, "end_s": 8, "action": "@Alice turns.", "camera": "Close-up", "dialogue": "@Alice says: Hello."}],
                "soundscape": "Room tone", "music": "N/A"}

    def test_suggestion_keeps_editable_times_camera_and_dialogue(self):
        result = direction.parse_direction("```json\n" + json.dumps(self.answer()) + "\n```", 8)
        self.assertIn("0.000-4.000: @Alice enters.", result["shots"])
        self.assertIn("Camera: Slow dolly", result["shots"])
        self.assertIn("@Alice says: Hello.", result["shots"])
        self.assertEqual(result["music"], "N/A")

    def test_manual_dialogue_survives_a_scene_proposal(self):
        # A proposal may rewrite action and camera, but a line the user typed must not disappear.
        suggested = "0.000-4.000: @Alice enters.\n4.000-8.000: @Alice turns."
        current = "0.000-4.000: Alice enters.\n@Alice says: Hello.\n4.000-8.000: Alice turns.\nCamera: Close-up."
        merged, kept = direction.keep_manual_dialogue(suggested, current)
        self.assertIn("@Alice says: Hello.", merged)
        self.assertIn(merged.splitlines()[0], "0.000-4.000: @Alice enters.")
        self.assertEqual(kept, ["@Alice says: Hello."])

    def test_the_users_own_line_replaces_the_one_the_ai_wrote_for_that_speaker(self):
        # Real gemma split: "@Mage says: Welcome back." came back as "@Mage says: Welcome... settle your spirit."
        suggested = ("0.000-3.000: The mage stands.\n@Mage says: Welcome... settle your spirit.\n"
                     "3.000-8.000: Close up.\n@Mage says: Find the quiet.")
        merged, kept = direction.keep_manual_dialogue(suggested, "", "@Mage says: Welcome back.")
        self.assertEqual(merged, "0.000-3.000: The mage stands.\n@Mage says: Welcome back.\n3.000-8.000: Close up.")
        self.assertEqual(kept, ["@Mage says: Welcome back."])
        result = direction.finish_direction(json.dumps({"shots": [{"start_s": 0, "end_s": 8, "action": "The mage stands.", "dialogue": "@Mage says: Hi."}]}),
                                            8, [{"widgets": {"name": "Mage"}}], "", "@Mage says: Welcome back.")
        self.assertIn("@Mage says: Welcome back.", result["shots"]); self.assertNotIn("Hi.", result["shots"])

    def test_dialogue_the_proposal_repeats_is_not_written_twice(self):
        suggested = "0.000-8.000: @Alice enters.\n@Alice says: Hello."
        merged, kept = direction.keep_manual_dialogue(suggested, "0.000-8.000: Alice enters.\n@Alice says: Hello.")
        self.assertEqual(kept, [])
        self.assertEqual(merged, suggested)

    def test_nothing_is_kept_without_dialogue_or_without_shots(self):
        suggested = "0.000-8.000: @Alice enters."
        for current in ("", "0.000-8.000: Alice enters.\nCamera: Close-up.", "no times here"):
            with self.subTest(current=current):
                self.assertEqual(direction.keep_manual_dialogue(suggested, current), (suggested, []))
        # A line before the first timed shot is not a shot; parse_shots already reports that separately.
        self.assertEqual(direction.keep_manual_dialogue("", "0.000-8.000: x\n@Bob says: Hi."), ("", []))

    def test_a_saved_proposal_still_parses_as_shots(self):
        # The kept line is written as a timed block, so parse_shots accepts it like any other shot text.
        from _pack import module
        shots = module("ng.core.shots")
        suggested = "0.000-8.000: @Alice enters."
        merged, _ = direction.keep_manual_dialogue(suggested, "0.000-8.000: Alice enters.\n@Alice says: Hello.")
        parsed, issues = shots.parse_shots(merged, 8 * 24)
        self.assertEqual(issues, ())
        self.assertTrue(any("@Alice says: Hello." in shot.text for shot in parsed))

    def test_invalid_times_do_not_change_the_project(self):
        # Still refused: a shot that ends before it starts or before the previous one, no number, no action.
        for change in ({"end_s": 4}, {"end_s": 3}, {"start_s": float("nan")}, {"action": ""}):
            answer = self.answer()
            answer["shots"][1].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                direction.parse_direction(json.dumps(answer), 8)
        for answer in (None, "[]", '{"shots":[]}', "not json"):
            with self.assertRaises(ValueError):
                direction.parse_direction(answer, 8)

    def test_an_answer_cut_off_by_max_tokens_says_so(self):
        """512 tokens ended a real 10 s shot list mid-sentence; "not valid JSON" sent the user looking for another model."""
        whole = json.dumps(self.answer())
        for cut in (whole[:len(whole) // 2], "```json\n" + whole[:-5]):
            with self.subTest(cut=cut[-20:]), self.assertRaisesRegex(ValueError, "Raise Max tokens"):
                direction.parse_direction(cut, 8)
        with self.assertRaisesRegex(ValueError, "generative model"):
            direction.parse_direction(",,,,,,", 8)
        self.assertEqual(direction.direct_tokens(512), 2048)
        self.assertEqual(direction.direct_tokens(4096), 4096)

    def test_prompt_sends_meanings_without_local_file_paths_or_credentials(self):
        context = {"media": "image", "widgets": {"name": "Alice", "description": "a woman", "image": "private/file.png", "usage": "reference"}}
        prompt = direction.direction_prompt("She walks.", 8, [context])
        self.assertIn("Alice", prompt)
        self.assertNotIn("private/file.png", prompt)
        self.assertIn("Do not claim generation", prompt)

    def test_gaps_overlaps_and_a_short_end_are_laid_end_to_end_unknown_mentions_become_words(self):
        # Qwen3-VL 4B ended a 10 s project at 5 s; the whole proposal used to be thrown away for it.
        for change in ({"start_s": 5}, {"start_s": 3}, {"end_s": 7}, {"end_s": 9}):
            answer=self.answer();answer["shots"][1].update(change)
            result = direction.parse_direction(json.dumps(answer),8)
            self.assertIn("0.000-4.000: @Alice enters.",result["shots"]); self.assertIn("4.000-8.000: @Alice turns.",result["shots"])
            self.assertTrue(result["timing_adjusted"], change)
        self.assertNotIn("timing_adjusted", direction.parse_direction(json.dumps(self.answer()),8))
        one = {"shots": [{"start_s": 0, "end_s": 5, "action": "She sings."}]}
        self.assertEqual(direction.parse_direction(json.dumps(one), 10)["shots"], "0.000-10.000: She sings.")
        past = self.answer(); past["shots"][0]["end_s"] = 12
        filled = direction.parse_direction(json.dumps(past), 8)["shots"]
        self.assertTrue(filled.startswith("0.000-8.000: @Alice enters.") and "turns" not in filled, "a shot past the end fills it; later ones are dropped")
        # An @name of no Content no longer throws the whole proposal away; it becomes a plain word and is named.
        plain = direction.parse_direction(json.dumps(self.answer()),8,[])
        self.assertIn("Alice enters.",plain["shots"]); self.assertNotIn("@Alice",plain["shots"])
        self.assertEqual(plain["unknown_mentions"],["Alice"])
        self.assertIn("Alice",direction.parse_direction(json.dumps(self.answer()),8,[{"widgets":{"name":"Alice"}}])["shots"])

    def test_context_names_with_spaces_and_prefixes_are_resolved(self):
        answer = self.answer()
        answer["shots"][0]["action"] = "@Alice Cooper enters. @Alice follows."
        contexts = [{"widgets": {"name": "Alice"}}, {"widgets": {"name": "Alice Cooper"}}]
        self.assertIn("@Alice Cooper", direction.parse_direction(json.dumps(answer), 8, contexts)["shots"])
        answer["shots"][0]["action"] = "@AliceX enters. @Name waves."
        result = direction.parse_direction(json.dumps(answer), 8, contexts)
        self.assertIn("AliceX enters. Name waves.", result["shots"])
        self.assertEqual(result["unknown_mentions"], ["AliceX", "Name"])

    def test_the_prompt_names_the_mentions_it_allows_instead_of_a_placeholder(self):
        # Qwen3-VL 4B copied the instruction's "@Name" into a real answer for the user's workflow.
        alice = {"media": "image", "widgets": {"name": "Alice"}}
        for prompt in (direction.direction_prompt("She walks.", 8, [alice]),
                       direction.direction_prompt("She walks.", 8, [alice], json.dumps({"format": "h3-director-shots", "schema_version": 1,
                           "shots": [{"id": "s1", "start": 0, "end": 8, "text": "Walk.", "media": [], "spoken": [], "locked_fields": []}]}))):
            self.assertNotIn("@Name", prompt)
            self.assertIn("@Alice", prompt)
        self.assertIn("write no @ mentions", direction.direction_prompt("She walks.", 8, []))
        self.assertNotIn("exact words", direction.direction_prompt("She walks.", 8, [alice]), "no sample line to copy")


if __name__ == "__main__":
    unittest.main()
