"""A shot set in the place of an earlier one ("Place like Shot 1", core/places.py; user 2026-10-18 after the tavern test)."""
import json
import os
import tempfile
import unittest
from unittest import mock

from _pack import comfy_available, module

ctx, chunks, project, places = (module("ng.core.context"), module("ng.core.chunks"), module("ng.core.project"),
                                module("ng.core.places"))
HAVE_COMFY = comfy_available()


def plan(mode="ref2va", place_from="s1", seconds=(5, 5, 5), items=None):
    starts = [sum(seconds[:n]) for n in range(len(seconds))]
    texts = ("@Luna sits in a cozy tavern.", "@Luna walks across a market square.", "@Luna comes back into the tavern.")
    records = [{"id": "s%d" % (n + 1), "start": start, "end": start + length, "text": texts[n % 3], "media": []}
               for n, (start, length) in enumerate(zip(starts, seconds))]
    if place_from is not None:
        records[-1]["place_from"] = place_from
    luna = ctx.ContextItem("luna", "Luna", "image", "luna.png", usage=("reference",), content=("character",), description="A woman.")
    context = ctx.DirectorContext(shots_text=json.dumps({"format": "h3-director-shots", "schema_version": 1, "shots": records}),
                                  items=(luna,) if items is None else items, project_seconds=sum(seconds), mode=mode, music="N/A",
                                  soundscape="Quiet.", width=1024, height=576)
    return project.plan_project(context, 0, chunks.ContinuityPlan("video_audio"))


def codes(result):
    return [issue.code for issue in result.issues]


class Planning(unittest.TestCase):
    def test_the_later_shot_opens_its_own_part_and_gets_the_place_card(self):
        result = plan()
        third = next(r for r in json.loads(result.context.shots_text)["shots"] if r["id"] == "s3")
        target = next(c for c in result.plan.chunks if c.story_start_f == module("ng.core.frames").seconds_to_frames(third["start"]))
        self.assertGreater(target.index, 0)
        self.assertEqual(target.head_frames, result.plan.continuity.head, "a join: the pin stays")
        (place,) = result.places
        self.assertEqual((place.target_id, place.source_id), ("s3", "s1"))
        self.assertEqual(place.frame, 24, "1 s into the earlier shot")
        self.assertTrue(place.source.startswith(places.FOLDER + "/"))
        compiled = result.compiled[target.index]
        self.assertIn(place.context_id, [ref.ctx_id for ref in compiled.refs])
        self.assertIn(places.DESCRIPTION, compiled.prompt)
        for earlier in result.compiled[:target.index]:
            self.assertNotIn(place.context_id, [ref.ctx_id for ref in earlier.refs], "only the later shot uses it")

    def test_the_picture_is_in_an_earlier_part_than_the_one_that_uses_it(self):
        result = plan()
        (place,) = result.places
        source = [c for c in result.plan.chunks if places.in_chunk(result.places, c)]
        user = [c for c, compiled in zip(result.plan.chunks, result.compiled) if place.context_id in [r.ctx_id for r in compiled.refs]]
        self.assertEqual(len(source), 1)
        self.assertLess(source[0].index, user[0].index)

    def test_an_automatic_first_last_frame_project_stays_one(self):
        result = plan(mode="auto", items=())
        self.assertEqual(result.context.mode, "fl2va")
        self.assertTrue(result.places)

    def test_without_a_link_nothing_changes(self):
        self.assertEqual(plan(place_from=None).places, ())
        self.assertNotIn("place_moved", codes(plan(place_from=None)))

    def test_a_missing_or_later_source_is_reported_and_left_out(self):
        gone = plan(place_from="nope")
        self.assertEqual(gone.places, ())
        self.assertIn("place_unknown", codes(gone))
        later = plan(place_from="s3")
        self.assertEqual(later.places, ())
        self.assertIn("place_later", codes(later))

    def test_a_shot_too_short_for_a_part_of_its_own_is_left_out(self):
        result = plan(seconds=(5, 5, 0.5))
        self.assertEqual(result.places, ())
        self.assertIn("place_too_close", codes(result))

    def test_the_picture_lies_inside_the_earlier_shot(self):
        result = plan(seconds=(1, 5, 5))
        (place,) = result.places
        self.assertLess(place.frame, 24, "a 1 s shot: its middle, not past its end")


class Window(unittest.TestCase):
    @unittest.skipUnless(HAVE_COMFY, "ComfyUI is not importable")
    def test_the_window_starts_one_vae_clip_early_and_finds_the_frame(self):
        adapter = module("ng.adapters.places")
        self.assertEqual(adapter.window(5, 60), (0, 7, 5))
        start, stop, index = adapter.window(40, 60)
        self.assertEqual((start, stop), (5, 17))
        self.assertEqual(index, 40 - 17)


@unittest.skipUnless(HAVE_COMFY, "ComfyUI is not importable")
class Writing(unittest.TestCase):
    def test_the_part_that_shows_the_place_writes_its_picture(self):
        import torch
        from comfy.nested_tensor import NestedTensor
        adapter = module("ng.adapters.places")
        pin = module("ng.core.pin")
        result = plan()
        job = next(j for j in project.jobs(result) if places.in_chunk(result.places, j.chunk))
        steps = pin.steps_for_frames(job.chunk.sampled_frames)
        latent = {"samples": NestedTensor((torch.zeros(1, 24, steps, 2, 2), torch.zeros(1, 32, 2, 4)))}

        def decode(video):
            count = pin.pixel_frames(video.shape[2])
            return torch.arange(count).float().div(1000).view(count, 1, 1, 1).expand(count, 4, 4, 3)

        with tempfile.TemporaryDirectory() as root, mock.patch("folder_paths.get_input_directory", return_value=root):
            (path,) = adapter.write(job, latent, decode)
            self.assertTrue(os.path.isfile(path))
            self.assertTrue(path.startswith(os.path.join(root, places.FOLDER)))
            from PIL import Image
            with Image.open(path) as picture:
                self.assertEqual(picture.getpixel((0, 0))[0], round(24 / 1000 * 255), "frame 24 of the part")
        other = next(j for j in project.jobs(result) if not places.in_chunk(result.places, j.chunk))
        self.assertEqual(adapter.write(other, latent, decode), [])

    def test_a_rewritten_picture_does_not_change_the_resume_key(self):
        resume = module("ng.adapters.resume")
        result = plan()
        job = next(j for j in project.jobs(result) if any(places.is_place(r.ctx_id) for r in j.compiled.refs))
        with mock.patch.object(resume, "_file", return_value=[1, 2]):
            first = resume.part_key(job, {"seed": 1})
        with mock.patch.object(resume, "_file", return_value=[1, 3]):
            again = resume.part_key(job, {"seed": 1})
        # luna.png's stamp changed too, so compare with only the place picture rewritten
        with mock.patch.object(resume, "_file", side_effect=lambda source: [1, 2] if source == "luna.png" else [9, 9]):
            rewritten = resume.part_key(job, {"seed": 1})
        self.assertNotEqual(first, again)
        self.assertEqual(first, rewritten)


if __name__ == "__main__":
    unittest.main()
