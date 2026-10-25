"""The example workflows' pictures, voice, song and videos ship in examples/input and are copied into ComfyUI's input folder
once, so a workflow opens ready to run. They sit at the input folder's top level (h3-example-*): a subfolder name would be
spelled with "\\" on Windows and "/" elsewhere, and a workflow saved on one would not find the file on the other.
A file that is already there is never overwritten."""
import logging
import os
import shutil

import folder_paths

SOURCE = os.path.join(os.path.dirname(__file__), "..", "..", "examples", "input")


def install():
    target = folder_paths.get_input_directory()
    for name in sorted(os.listdir(SOURCE)) if os.path.isdir(SOURCE) else []:
        path = os.path.join(target, name)
        if not os.path.exists(path):
            try:
                shutil.copyfile(os.path.join(SOURCE, name), path)
            except OSError as error:
                logging.warning("[H3 Director] could not copy the example file %s to the input folder: %s", name, error)
