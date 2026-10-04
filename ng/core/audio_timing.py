"""Intersect selected source audio with normalized Shot, audio-lane and sampled-chunk time."""
from .frames import seconds_to_frames
from .issues import Issue
from .shots import parse_shots
from .shot_document import read_audio_clips, read_document


def source_window(item):
    start = seconds_to_frames(item.options.start_s)
    ends = [value for value in (item.options.end_s, item.length_s) if value > 0]
    return start, max(0, seconds_to_frames(min(ends)) - start) if ends else None


def file_window(item):
    """An audio-lane clip's offset is a second in the file itself (the Studio's "From second in file"), not within the
    card's selected range; only the end of the file limits it."""
    return 0, seconds_to_frames(item.length_s) if item.length_s > 0 else None


def shot_windows(context):
    """{context id: [(story start, story end, source offset)]} for Shot bindings; None for timed text."""
    if read_document(context.shots_text) is None:
        return None
    shots, _ = parse_shots(context.shots_text, seconds_to_frames(context.project_seconds))
    windows = {}
    for shot in shots:
        for identity in dict.fromkeys(binding.context_id for binding in shot.media):
            windows.setdefault(identity, []).append((shot.start_f, shot.end_f, 0))
    return windows


def clip_windows(context, modes):
    """The same spans for audio-lane clips of the given modes, clipped to the project's end."""
    total, windows = seconds_to_frames(context.project_seconds), {}
    for clip in sorted(read_audio_clips(context.shots_text), key=lambda c: c.start):
        start, end = seconds_to_frames(clip.start), min(seconds_to_frames(clip.end), total)
        if clip.mode in modes and end > start:
            windows.setdefault(clip.context_id, []).append((start, end, seconds_to_frames(clip.offset)))
    return windows


def clip_issues(context):
    """Nothing is cut silently: a clip past the project's end, or one whose offset lies past its file's end, is named."""
    issues = []
    for clip in read_audio_clips(context.shots_text):
        item = context.item(clip.context_id)
        if item is not None and item.length_s > 0 and clip.offset >= item.length_s:
            issues.append(Issue("audio_clip_past_file", "starts at %.2fs in the file, but the file is only %.2fs long; it plays nothing."
                                % (clip.offset, item.length_s), clip.id))
        elif clip.start >= context.project_seconds:
            issues.append(Issue("audio_clip_after_end", "starts after the project ends and is not played.", clip.id))
        elif clip.end > context.project_seconds:
            issues.append(Issue("audio_clip_clipped", "runs past the project end and stops at %.2fs." % context.project_seconds, clip.id))
    return issues


def timed_segments(item, chunk, windows, retention, in_file=False):
    source_start, available = file_window(item) if in_file else source_window(item)
    window_start = chunk.story_start_f - chunk.head_frames
    origins = windows.get(item.id) if windows is not None else None
    spans = origins if origins is not None else [(0, chunk.story_end_f, 0)]
    out = []
    for origin, end, offset in spans:
        first = max(origin, window_start)
        last = min(end, chunk.story_end_f, origin + available - offset if available is not None else end)
        if last <= first:
            continue
        start, length = first - window_start, last - first
        segment = {"type": "audio", "audioFile": item.source, "fileName": item.name, "start": start, "length": length,
                   "trimStart": source_start + offset + first - origin, "retention": retention, "ng_item": item.id, "ng_start": start}
        if origins is not None and retention == "fully_copy":
            segment.update(retention="partially_copy", refNote="Copy this selected clip only at %.3f-%.3fs in the target video; "
                           "its first sample starts at %.3fs. Generate the other sound outside this interval."
                           % (start / 24, (start + length) / 24, start / 24))
        out.append(segment)
    return out
