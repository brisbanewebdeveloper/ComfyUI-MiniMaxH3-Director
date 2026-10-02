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

    def test_invalid_times_do_not_change_the_project(self):
        for change in ({"start_s": 3}, {"end_s": 9}, {"end_s": 4}, {"start_s": float("nan")}, {"action": ""}):
            answer = self.answer()
            answer["shots"][1].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                direction.parse_direction(json.dumps(answer), 8)
        for answer in (None, "[]", '{"shots":[]}', "not json"):
            with self.assertRaises(ValueError):
                direction.parse_direction(answer, 8)

    def test_prompt_sends_meanings_without_local_file_paths_or_credentials(self):
        context = {"media": "image", "widgets": {"name": "Alice", "description": "a woman", "image": "private/file.png", "usage": "reference"}}
        prompt = direction.direction_prompt("She walks.", 8, [context])
        self.assertIn("Alice", prompt)
        self.assertNotIn("private/file.png", prompt)
        self.assertIn("Do not claim generation", prompt)


if __name__ == "__main__":
    unittest.main()
