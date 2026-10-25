"""The example files reach the input folder once, at its top level, and never overwrite a file of the same name."""
import os
import re
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from _pack import REPO, module, comfy_available

HAVE_COMFY = comfy_available()
SOURCE = Path(REPO) / "examples" / "input"


@unittest.skipUnless(HAVE_COMFY, "needs ComfyUI's folder_paths")
class ExampleMedia(unittest.TestCase):
    def test_missing_files_are_copied_and_present_ones_kept(self):
        media = module("ng.adapters.example_media")
        with tempfile.TemporaryDirectory() as inputs:
            Path(inputs, "h3-example-hero.jpg").write_bytes(b"mine")
            with mock.patch.object(media.folder_paths, "get_input_directory", return_value=inputs):
                media.install()
            self.assertEqual(Path(inputs, "h3-example-hero.jpg").read_bytes(), b"mine")
            self.assertEqual(sorted(os.listdir(inputs)), sorted(os.listdir(SOURCE)))


class ExampleWorkflowsUseTheShippedFiles(unittest.TestCase):
    def test_every_example_file_a_workflow_names_is_shipped(self):
        shipped = set(os.listdir(SOURCE))
        for path in (Path(REPO) / "example_workflows").glob("H3 Director - *.json"):
            for name in set(re.findall(r"h3-example-[\w.-]+\.\w+", path.read_text(encoding="utf8"))):
                self.assertIn(name, shipped, path.stem)


if __name__ == "__main__":
    unittest.main()
