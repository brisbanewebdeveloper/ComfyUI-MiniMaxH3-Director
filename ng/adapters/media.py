"""Load the media a compiled chunk refers to, with the legacy pack's loaders (path lookup, trimming, resampling, size limits)."""
from ... import minimax_media as legacy
from ... import minimax_plan as plan
from ..core.compile import MediaRef
from ..core.limits import FPS
from .paths import input_path


class MediaError(RuntimeError):
    """A file the plan needs could not be read. The message names the context item."""


def _require_file(ref: MediaRef, what):
    """The legacy loaders turn a missing file into a blank picture or silence; NG stops and names the item instead."""
    if not input_path(ref.source):
        raise MediaError("the %s '%s' (%s) is not in ComfyUI's input folder" % (what, ref.ctx_id, ref.source))


def load_picture(ref: MediaRef):
    _require_file(ref, "image")
    return legacy.load_image_source("", ref.source)


def load_video(ref: MediaRef):
    _require_file(ref, "video")
    seconds = min(plan.REF_VIDEO_MAX_SEC, (ref.length_f or FPS * plan.REF_VIDEO_MAX_SEC) / float(FPS))
    edge = plan.REF_VIDEO_SHORT_EDGE
    try:
        frames = legacy.load_video_tensor(ref.source, ref.trim_start_f / float(FPS), seconds, max_short_edge=edge,
                                          max_pixels=int(edge * edge * plan.REF_VIDEO_ASPECT_BUDGET), strict=True)
    except Exception as error:
        raise MediaError("the video '%s' (%s) could not be read" % (ref.ctx_id, ref.source)) from error
    minimum = 1 if ref.kind == "continue_video" else 5
    if frames.shape[0] < minimum:
        raise MediaError("the video '%s' (%s) is shorter than %d frames or could not be read" % (ref.ctx_id, ref.source, minimum))
    return frames


def load_audio(ref: MediaRef):
    _require_file(ref, "audio")
    clip = legacy.load_audio_segment({"audioFile": ref.source, "trimStart": ref.trim_start_f, "length": ref.length_f or FPS * 15}, float(FPS))
    if clip is None:
        raise MediaError("the audio '%s' (%s) could not be loaded" % (ref.ctx_id, ref.source))
    return clip


def numbered(prefix, tensors):
    """The core nodes take references as ref_image_1, ref_image_2, ... in label order."""
    return {"%s_%d" % (prefix, n): t for n, t in enumerate(tensors, 1)} or None

