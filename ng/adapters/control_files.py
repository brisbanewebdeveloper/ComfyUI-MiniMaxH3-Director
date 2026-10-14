"""Import a generated control video from our output subfolder into the Context cards' input folder."""
import os
import shutil
import uuid

import folder_paths


def import_video(filename, subfolder):
    if not isinstance(filename, str) or os.path.basename(filename) != filename or any(c in filename for c in ("/", "\\", ":")):
        raise ValueError("Choose a generated control video filename.")
    if os.path.splitext(filename)[1].lower() not in (".mp4", ".mkv", ".webm"):
        raise ValueError("The generated control result must be a video.")
    root = os.path.realpath(folder_paths.get_output_directory())
    source = os.path.realpath(os.path.join(root, subfolder, filename))
    control_root = os.path.realpath(os.path.join(root, "h3-control"))
    if os.path.commonpath((root, control_root)) != root or os.path.commonpath((control_root, source)) != control_root:
        raise ValueError("Choose a generated video inside output/h3-control.")
    inputs = os.path.realpath(folder_paths.get_input_directory())
    destination = os.path.realpath(os.path.join(inputs, "h3-control"))
    if os.path.commonpath((inputs, destination)) != inputs:
        raise ValueError("The h3-control input folder must stay inside input.")
    os.makedirs(destination, exist_ok=True)
    name = "control_" + uuid.uuid4().hex + os.path.splitext(filename)[1].lower()
    with open(source, "rb") as src, open(os.path.join(destination, name), "xb") as dst:
        shutil.copyfileobj(src, dst)
    return os.path.join("h3-control", name)
