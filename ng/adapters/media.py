"""Load the media a compiled chunk refers to, with the legacy pack's loaders (path lookup, trimming, resampling, size limits)."""
from ... import minimax_media as legacy
from ... import minimax_plan as plan
from ..core.compile import MediaRef
from ..core.limits import FPS


class MediaError(RuntimeError):
    """A file the plan needs could not be read. The message names the context item."""


def load_picture(ref: MediaRef):
    tensor = legacy.load_image_source("", ref.source)
    if tensor is None or tensor.shape[0] < 1:
        raise MediaError("the image '%s' (%s) could not be loaded" % (ref.ctx_id, ref.source))
    return tensor


def load_video(ref: MediaRef):
    seconds = min(plan.REF_VIDEO_MAX_SEC, (ref.length_f or FPS * plan.REF_VIDEO_MAX_SEC) / float(FPS))
    edge = plan.REF_VIDEO_SHORT_EDGE
    frames = legacy.load_video_tensor(ref.source, ref.trim_start_f / float(FPS), seconds, max_short_edge=edge,
                                      max_pixels=int(edge * edge * plan.REF_VIDEO_ASPECT_BUDGET))
    if frames.shape[0] < 5:
        raise MediaError("the video '%s' (%s) is shorter than 5 frames or could not be read" % (ref.ctx_id, ref.source))
    return frames


def load_audio(ref: MediaRef):
    clip = legacy.load_audio_segment({"audioFile": ref.source, "trimStart": ref.trim_start_f, "length": ref.length_f or FPS * 15}, float(FPS))
    if clip is None:
        raise MediaError("the audio '%s' (%s) could not be loaded" % (ref.ctx_id, ref.source))
    return clip


def numbered(prefix, tensors):
    """The core nodes take references as ref_image_1, ref_image_2, ... in label order."""
    return {"%s_%d" % (prefix, n): t for n, t in enumerate(tensors, 1)} or None

