"""Runs the frontend module tests with Node, and syntax-checks every NG module, so one command covers both languages."""
import os
import shutil
import subprocess
import unittest

from _pack import REPO

JS_DIR = os.path.join(REPO, "js", "ng")
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "node is not installed; the NG frontend was NOT checked")
class Frontend(unittest.TestCase):
    def test_every_module_parses(self):
        for name in sorted(os.listdir(JS_DIR)):
            if name.endswith(".js"):
                result = subprocess.run([NODE, "--check", os.path.join(JS_DIR, name)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, "%s: %s" % (name, result.stderr))

    def test_logic_tests_pass(self):
        result = subprocess.run([NODE, os.path.join(REPO, "tests", "ng", "js", "test_ng_js.mjs")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_context_text_rename_passes(self):
        result = subprocess.run([NODE, os.path.join(REPO, "tests", "ng", "js", "test_ng_context_text.mjs")], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
