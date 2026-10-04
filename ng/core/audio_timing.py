"""Intersect selected source audio with normalized Shot and sampled-chunk time."""
from .frames import seconds_to_frames
from .shots import parse_shots
from .shot_document import read_document


def source_window(item):
    start = seconds_to_frames(item.options.start_s)
    ends = [value for value in (item.options.end_s, item.length_s) if value > 0]
    return start, max(0, seconds_to_frames(min(ends)) - start) if ends else None


def shot_windows(context):
    if read_document(context.shots_text) is None:
        return None
    shots, _ = parse_shots(context.shots_text, seconds_to_frames(context.project_seconds))
    windows = {}
    for shot in shots:
        for identity in dict.fromkeys(binding.context_id for binding in shot.media):
            windows.setdefault(identity, []).append((shot.start_f, shot.end_f))
    return windows


def timed_segments(item, chunk, windows, retention):
    source_start, available = source_window(item)
    window_start = chunk.story_start_f - chunk.head_frames
    origins = windows.get(item.id) if windows is not None else None
    spans = origins if origins is not None else [(0, chunk.story_end_f)]
    out = []
    for origin, end in spans:
        first = max(origin, window_start)
        last = min(end, chunk.story_end_f, origin + available if available is not None else end)
        if last <= first:
            continue
        start, length = first - window_start, last - first
        segment = {"type": "audio", "audioFile": item.source, "fileName": item.name, "start": start, "length": length,
                   "trimStart": source_start + first - origin, "retention": retention, "ng_item": item.id, "ng_start": start}
        if origins is not None and retention == "fully_copy":
            segment.update(retention="partially_copy", refNote="Copy this selected clip only at %.3f-%.3fs in the target video; "
                           "its first sample starts at %.3fs. Generate the other sound outside this interval."
                           % (start / 24, (start + length) / 24, start / 24))
        out.append(segment)
    return out
