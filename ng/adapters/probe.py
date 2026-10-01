"""Read basic facts about an input file (its length), without decoding it."""
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
