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
        for change in ({"start_s": 3}, {"end_s": 9}, {"end_s": 4}, {"start_s": float("nan")}, {"action": ""}):
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

    def test_gaps_incomplete_duration_and_unknown_contexts_are_rejected(self):
        for change in ({"start_s": 5}, {"end_s": 7}):
            answer=self.answer();answer["shots"][1].update(change)
            with self.assertRaises(ValueError):
                direction.parse_direction(json.dumps(answer),8)
        with self.assertRaisesRegex(ValueError,"unknown context"):
            direction.parse_direction(json.dumps(self.answer()),8,[])
        self.assertIn("Alice",direction.parse_direction(json.dumps(self.answer()),8,[{"widgets":{"name":"Alice"}}])["shots"])

    def test_context_names_with_spaces_and_prefixes_are_resolved(self):
        answer = self.answer()
        answer["shots"][0]["action"] = "@Alice Cooper enters. @Alice follows."
        contexts = [{"widgets": {"name": "Alice"}}, {"widgets": {"name": "Alice Cooper"}}]
        self.assertIn("@Alice Cooper", direction.parse_direction(json.dumps(answer), 8, contexts)["shots"])
        answer["shots"][0]["action"] = "@AliceX enters."
        with self.assertRaisesRegex(ValueError, "unknown context"):
            direction.parse_direction(json.dumps(answer), 8, contexts)


if __name__ == "__main__":
    unittest.main()
