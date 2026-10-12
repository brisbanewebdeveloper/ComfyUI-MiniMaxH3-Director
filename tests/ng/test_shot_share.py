"""A shot over several render parts gives each part its own share of the action (real runs 2026-10-12 repeated it)."""
import json
import unittest

from _pack import module

share = module("ng.core.shot_share")
ctx, chunks, project = module("ng.core.context"), module("ng.core.chunks"), module("ng.core.project")

WALK = ("Aurelia turns around and walks away deep into the dark stone hall until she is small in the distance, then turns back and "
        "walks toward the camera until her face fills the frame in a close-up. At the end she stands still, looks into the camera "
        "with her cyan-blue eyes and smiles confidently.")
BEATS = "A calm bedroom. 0–2.5s: They recline. 2.5–5s: A touch. 5–7.5s: They sit up. 7.5–10s: The magic fades."


class Share(unittest.TestCase):
    def test_a_part_with_the_whole_shot_keeps_the_text(self):
        self.assertEqual(share.share(WALK, 0, 240, 0, 240, 0), WALK)
        self.assertEqual(share.share(WALK, -1, -1, 100, 200, 78), WALK, "no span known: unchanged")

    def test_clauses_follow_the_shot_time(self):
        first, second = share.share(WALK, 0, 481, 0, 240, 0), share.share(WALK, 0, 481, 240, 481, 218)
        self.assertTrue(first.endswith("in the distance, then turns back and walks toward the camera until her face fills the frame "
                                       "in a close-up."), first)
        self.assertNotIn("At the end", first)
        self.assertTrue(second.startswith("then turns back"), second)
        self.assertNotIn("walks away", second)
        self.assertIn("At the end she stands still", second)

    def test_beats_go_to_their_part_retimed(self):
        self.assertEqual(share.share(BEATS, 0, 240, 0, 121, 0), "A calm bedroom. 0–2.5s: They recline. 2.5–5s: A touch.")
        self.assertEqual(share.share(BEATS, 0, 240, 121, 240, 99), "A calm bedroom. 0.9–3.4s: They sit up. 3.4–5.9s: The magic fades.")

    def test_a_shot_only_in_the_pinned_head_gets_no_action(self):
        self.assertEqual(share.share(WALK, 0, 120, 120, 120, 98), share.HEAD_ONLY)

    def test_one_sentence_stays_whole(self):
        self.assertEqual(share.share("She dances.", 0, 481, 240, 481, 218), "She dances.")


class Compiled(unittest.TestCase):
    def plan(self, records, seconds, part_seconds, mode="ref2va"):
        document = json.dumps({"format": "h3-director-shots", "schema_version": 1, "shots": records})
        items = (ctx.ContextItem("hero", "Hero", "image", "hero.png", usage=("reference",)),)
        return project.plan_project(ctx.DirectorContext(shots_text=document, items=items, project_seconds=seconds, mode=mode),
                                    part_seconds, chunks.ContinuityPlan("video_audio")).compiled

    def test_a_long_shot_is_not_played_again_in_its_second_part(self):
        compiled = self.plan([{"id": "s", "start": 0, "end": 20, "text": WALK.replace("Aurelia", "@Hero"), "media": []}], 20, 10)
        self.assertEqual(len(compiled), 2)
        self.assertNotIn("At the end", compiled[0].prompt)
        self.assertNotIn("walks away", compiled[1].prompt)
        self.assertIn("Continue the same scene and action from the preceding video", compiled[1].prompt)

    def test_a_shot_that_lives_only_in_the_head_is_not_replayed(self):
        # 6 shots of 5 s in 10 s parts: the head of part 2 still holds the end of shot 2 (the user's 30 s storyboard).
        records = [{"id": "p%d" % n, "start": 5 * (n - 1), "end": 5 * n, "text": "Action number %d happens." % n, "media": []}
                   for n in range(1, 7)]
        compiled = self.plan(records, 30, 10)
        for part in compiled[1:]:
            replayed = [n for n in range(1, 7) if "Action number %d happens." % n in part.prompt]
            self.assertTrue(all(n * 5 > 10 * part.index for n in replayed), (part.index, replayed))
        self.assertIn(share.HEAD_ONLY, compiled[1].prompt)


if __name__ == "__main__":
    unittest.main()
