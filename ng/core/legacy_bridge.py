"""Translate a Director Context and one chunk into the legacy `timeline_data` that `minimax_plan.plan_timeline` understands.

The legacy planner is the one place that knows how H3 wants references labelled, retention markers worded, dialogue formatted and
limits enforced, and it has hundreds of checks behind it. NG reuses it as the prompt compiler instead of writing a second one;
this module is the only door into it. Anything legacy needs that NG does not model is filled with a neutral default here.
"""
import re

from ... import minimax_plan as plan
from .chunks import Chunk
from .context import DirectorContext

FAR_AWAY = 10 ** 6          # parked past any window: a reference, not part of the soundtrack
_KIND = {"character": "person", "face": "person", "animal": "animal", "object": "object", "outfit": "clothing", "prop": "prop",
         "environment": "environment", "location": "environment", "style": "style", "lighting": "style", "composition": "style",
         "pose": "pose", "action": "action", "expression": "expression", "effect": "effect"}
_RETENTION = {"high": "fully_preserved", "medium": "partially_preserved", "low": "weak_reference"}
_AUDIO_RETENTION = {"voice": "reference", "music_style": "weak_reference", "copy": "fully_copy", "lock": "lock"}


class Mapping:
    """What each legacy slot or file stands for, so results can be translated back to context ids."""

    def __init__(self, slot_items, by_source):
        self.slot_items = tuple(slot_items)   # context id per legacy subject slot (slot number - 1)
        self.by_source = dict(by_source)      # file path -> context id (first item wins)


def has_references(context):
    for item in context.items:
        usage = item.effective_usage
        if item.media == "image" and "reference" in usage:
            return True
        if item.media == "video" or (item.media == "audio" and set(usage) & {"voice", "copy", "music_style"}):
            return True
    return False


def decide_mode(context):
    if context.mode != "auto":
        return context.mode
    return "ref2va" if has_references(context) else "fl2va"


def _kind(item):
    for value in item.content:
        if value in _KIND:
            return _KIND[value]
    return "person"


def _subject_items(context):
    return [i for i in context.items if i.media == "image" and "reference" in i.effective_usage and i.source]


def _slot(item, voices):
    voice = voices.get(item.id)
    return {"images": [{"name": item.source}], "description": item.description, "shortName": item.name, "kind": _kind(item),
            "retention": _RETENTION[item.preserve], "retentionNote": "",
            "voice": {"audioFile": voice.source, "fileName": voice.name} if voice else None}


def _voices_by_speaker(context):
    """Audio items with usage `voice` and a speaker, keyed by the speaker's item id. One voice per subject; extras stay loose."""
    voices = {}
    for item in context.by_media("audio"):
        if "voice" in item.effective_usage and item.speaker and item.source and item.speaker not in voices:
            voices[item.speaker] = item
    return voices


def _tag_substitutor(slot_items, context):
    names = {context.item(i).name: n for n, i in enumerate(slot_items, 1)}
    if not names:
        return lambda text: text
    pattern = re.compile(r"@(%s)(?![\w])" % "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True)), re.IGNORECASE)
    lowered = {k.lower(): v for k, v in names.items()}
    return lambda text: pattern.sub(lambda m: "@ref%d" % lowered[m.group(1).lower()], text)


def _window_frames(chunk, item_trim=0):
    """(start in sampled clip, length, trim into the file) for a medium that follows the story from its first frame."""
    base = chunk.story_start_f - chunk.head_frames
    return 0, chunk.sampled_frames, max(0, base) + item_trim


def _audio_segments(context, chunk, voices):
    segments = []
    used = {v.id for v in voices.values()}
    for item in context.by_media("audio"):
        if item.id in used or not item.source:
            continue
        usage = next((u for u in item.effective_usage if u in _AUDIO_RETENTION), "voice")
        timed = usage in ("copy", "lock")
        start, length, trim = _window_frames(chunk) if timed else (FAR_AWAY, int(max(item.length_s, 2.0) * 24), 0)
        segments.append({"type": "audio", "audioFile": item.source, "fileName": item.name, "start": start, "length": length,
                         "trimStart": trim, "retention": _AUDIO_RETENTION[usage]})
    return segments


def _motion_segments(context):
    out = []
    for item in context.by_media("video"):
        if item.source:
            length = int(round((item.length_s or 5.0) * 24))
            out.append({"type": "video", "videoFile": item.source, "fileName": item.name, "start": FAR_AWAY, "length": length,
                        "trimStart": 0, "retention": _RETENTION[item.preserve]})
    return out


def _shot_text(shot, substitute):
    """A shot that began in an earlier chunk keeps its action but not its spoken lines: those belong to where the shot starts."""
    text = substitute(shot.text)
    if shot.carried:
        text = "\n".join(line for line in text.splitlines() if not plan.DIALOGUE_RE.match(line.strip()))
    return text


def _anchor_segments(context, chunk, is_last):
    """Images used as first/last frame: only the first chunk takes a first frame and only the last chunk takes a last frame."""
    out = []
    for item in context.by_media("image"):
        usage = item.effective_usage
        if "first_frame" in usage and chunk.is_first:
            out.append({"type": "image", "imageFile": item.source, "fileName": item.name, "start": 0,
                        "length": max(chunk.sampled_frames // 8, 1), "prompt": ""})
        if "last_frame" in usage and is_last:
            out.append({"type": "image", "imageFile": item.source, "fileName": item.name, "isEndFrame": True,
                        "start": chunk.sampled_frames - max(chunk.sampled_frames // 8, 1),
                        "length": max(chunk.sampled_frames // 8, 1), "prompt": ""})
    return out


def _global_prompt(context):
    parts = [context.idea.strip()] if context.shots_text.strip() else []
    for item in context.by_media("text"):
        if item.source.strip():
            parts.append(item.source.strip())
    return " ".join(p for p in parts if p)


def build_timeline(context: DirectorContext, chunk: Chunk, mode: str):
    """Return (timeline_data dict, Mapping) for one chunk."""
    subjects = _subject_items(context)
    voices = _voices_by_speaker(context)
    substitute = _tag_substitutor([s.id for s in subjects], context)
    segments = [{"type": "text", "start": s.local_start_f, "length": s.local_end_f - s.local_start_f, "prompt": _shot_text(s, substitute)}
                for s in chunk.shots]
    segments += _anchor_segments(context, chunk, chunk.is_last)
    ref_on = mode == "ref2va"
    tdata = {"reference_mode": "REF2VA" if ref_on else "OFF", "prompt_format": "minimax", "global_prompt": substitute(_global_prompt(context)),
             "segments": segments, "subjects": [_slot(i, voices) for i in subjects] if ref_on else [],
             "subjectSlotCount": max(len(subjects), 1), "audioSegments": _audio_segments(context, chunk, voices),
             "motionSegments": _motion_segments(context) if ref_on else [], "overall_soundscape": context.soundscape,
             "non_diegetic_music": context.music}
    by_source = {}
    for item in context.items:
        by_source.setdefault(item.source, item.id)
    return tdata, Mapping([s.id for s in subjects], by_source)
