"""Read basic facts about an input file (its length, its stamp), without decoding it."""
import os

import av

from ... import minimax_media as legacy


def duration_seconds(source):
    """Length in seconds of an audio or video file in ComfyUI's input folder; 0.0 when it cannot be found or read."""
    path = legacy.resolve_input_path(source)
    if not path:
        return 0.0
    try:
        with av.open(path) as container:
            return max(container.duration or 0, 0) / float(av.time_base)
    except (av.error.FFmpegError, OSError, ValueError):
        return 0.0


def file_stamp(source):
    """Size and modification time of an input file, as text. ComfyUI caches a node by its inputs, so a context node must put this
    in its cache key: replacing a file under the same name then still reaches the render."""
    path = legacy.resolve_input_path(source.replace(" [input]", "").strip())
    if not path:
        return "missing"
    info = os.stat(path)
    return "%d:%d" % (info.st_size, info.st_mtime_ns)
