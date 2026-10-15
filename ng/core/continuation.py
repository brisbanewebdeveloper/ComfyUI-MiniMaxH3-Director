"""External video prefixes: selected source tail and the story openings that consume it."""
import math

from .chunks import ChunkOpening
from .limits import CONTINUE_VIDEO_FRAMES, FPS, GRID_OFFSET, GRID_STEP
from .shot_document import bound_media_ids


def source_end(item):
    ends = [end for end in (item.options.end_s, item.length_s) if end > 0]
    return min(ends) if ends else 0.0


def prefix_frames(item):
    end = source_end(item)
    available = math.floor((end - item.options.start_s) * FPS + 1e-6) if end else CONTINUE_VIDEO_FRAMES
    count = min(CONTINUE_VIDEO_FRAMES, max(available, 1))
    return count - (count - GRID_OFFSET) % GRID_STEP if count >= GRID_OFFSET else 1


def global_source(context):
    bound = bound_media_ids(context.shots_text)
    return next((item for item in context.by_media("video") if item.id not in bound and item.source
                 and "continue" in item.effective_usage), None)


def shot_source(context, shot):
    for binding in shot.media:
        item = context.item(binding.context_id)
        if item and item.media == "video" and item.source:
            roles = item.effective_usage if binding.role == "context" else (binding.role,)
            if "continue" in roles:
                return item
    return None


def opening(item):
    if not item or (source_end(item) and source_end(item) <= item.options.start_s):
        return None
    return ChunkOpening(prefix_frames(item), item.id)


def initial_opening(context, shots):
    item = next((shot_source(context, shot) for shot in shots if shot.start_f == 0 and shot_source(context, shot)), None)
    return opening(item or global_source(context))
