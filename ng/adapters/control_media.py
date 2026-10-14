"""Decode only this render part's control windows, at 24 fps and the render size."""
import torch
import comfy.utils

from ... import minimax_media
from ..core import control_timing
from ..core.frames import seconds_to_frames
from .paths import input_path


def frames(job):
    pieces = control_timing.spans(job)
    if not pieces:
        return None
    context = job.project.context
    first = job.chunk.story_start_f - job.chunk.head_frames
    out = torch.empty(job.chunk.sampled_frames, context.height, context.width, 3)
    cursor = 0
    for clip, a, b, source in pieces:
        item = context.item(clip.context_id)
        if not input_path(item.source):
            raise ValueError("Control video '%s' is missing: %s" % (item.name, item.source))
        limit = item.options.end_s or item.length_s
        last = max(0, seconds_to_frames(limit) - 1) if limit else source + b - a - 1
        source = min(source, last)
        count = min(b - a, last - source + 1)
        decoded = minimax_media.load_video_tensor(item.source, source / 24.0, count / 24.0, out_fps=24.0,
                                                  max_short_edge=min(context.width, context.height),
                                                  max_pixels=context.width * context.height, strict=True)
        decoded = comfy.utils.common_upscale(decoded.movedim(-1, 1), context.width, context.height, "bilinear", "center").movedim(1, -1)
        start, end = a - first, b - first
        if start > cursor:
            out[cursor:start] = out[cursor - 1] if cursor else decoded[0]
        indices = torch.arange(end - start).clamp(max=decoded.shape[0] - 1)
        out[start:end] = decoded[indices]
        cursor = end
    if cursor < out.shape[0]:
        out[cursor:] = out[cursor - 1]
    return out
