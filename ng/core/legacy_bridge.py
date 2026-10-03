"""Translate a Director Context and one chunk into the legacy `timeline_data` that `minimax_plan.plan_timeline` understands.

The legacy planner is the one place that knows how H3 wants references labelled, retention markers worded, dialogue formatted and
limits enforced, and it has hundreds of checks behind it. NG reuses it as the prompt compiler instead of writing a second one;
this module is the only door into it. Anything legacy needs that NG does not model is filled with a neutral default here.
"""

from ... import minimax_plan as plan
from .chunks import Chunk
from .context import DirectorContext
from .mentions import replace_mentions
from .context_options import retention_note
from .issues import Issue
from .subjects import subject_groups
from .shot_bindings import spoken_text

FAR_AWAY = 10 ** 6          # parked past any window: a reference, not part of the soundtrack
_KIND = {"character": "person", "face": "person", "animal": "animal", "object": "object", "outfit": "clothing", "prop": "prop",
         "environment": "environment", "location": "environment", "style": "style", "lighting": "style", "composition": "style",
         "pose": "pose", "action": "action", "expression": "expression", "effect": "effect"}
_RETENTION = {"high": "fully_preserved", "medium": "partially_preserved", "low": "weak_reference"}
_AUDIO_RETENTION = {"voice": "reference", "music_style": "weak_reference", "copy": "fully_copy", "lock": "lock",
                    "rhythm": "weak_reference", "sound_reference": "reference"}


class Mapping:
    """What each legacy slot or file stands for, so results can be translated back to context ids.

    `by_source` is only a fallback for media whose card cannot be told apart by anything else. Frame anchors are
    resolved by their role instead: two cards may hold the same file, and then "first wins" would attribute the last
    frame to the first-frame card.
    """

    def __init__(self, slot_items, by_source, anchor_items=None, voice_items=None):
        self.slot_items = tuple(slot_items)   # context id per legacy subject slot (slot number - 1)
        self.by_source = dict(by_source)      # file path -> context id (first item wins)
        self.anchor_items = dict(anchor_items or {})   # source path -> context id of the card holding that frame role
        self.voice_items = dict(voice_items or {})     # 1-based subject slot -> voice context id

    def media_id(self, seg, source):
        return seg.get("ng_item") or self.voice_items.get(seg.get("voice_slot")) or self.by_source.get(source, "")

    def anchor_id(self, role, source):
        found = self.anchor_items.get((role, source))
        return found if found is not None else self.by_source.get(source, "")


def has_references(context):
    for item in context.items:
        usage = item.effective_usage
        if item.media == "image" and "reference" in usage:
            return True
        if (item.media == "video" and set(usage) & {"motion", "camera", "structure"}) or (item.media == "audio" and set(usage) & set(_AUDIO_RETENTION) - {"lock"}):
            return True
    return False


def decide_mode(context):
    """`context.mode` is the user's explicit choice; the actual per-chunk mode comes out of the legacy planner,
    which already treats a first/last frame guide as fl2va (minimax_plan.py, `has_keyframe`)."""
    if context.mode != "auto":
        return context.mode
    return "ref2va" if has_references(context) else "fl2va"


def _kind(item):
    for value in item.content:
        if value in _KIND:
            return _KIND[value]
    return "person"


def _subject_items(context):
    return [group.root for group in subject_groups(context)]


def _slot(item, voices, images):
    voice = voices.get(item.id)
    note = retention_note(item.options)
    if len(images) > 1 and not note:
        note = "Preserve the base identity; linked references control only their stated properties."
    return {"images": [{"name": image.source, "ng_item": image.id} for image in images],
            "description": item.description, "shortName": item.name, "kind": _kind(item),
            "retention": _RETENTION[item.preserve], "retentionNote": note,
            "voice": {"audioFile": voice.source, "fileName": voice.name} if voice else None}


def _voices_by_speaker(context):
    """Voice items grouped by the subject they speak for: {subject id: [item, ...]} in project order.

    A subject may have more than one take. H3's slot takes a single voice file per subject, so the first take wins
    the slot and every further take stays an ordinary reference audio segment. Both facts are reported by
    `extra_voice_issues`, so a second take is never silently demoted to "some audio".
    """
    voices = {}
    subjects = {item.id for item in _subject_items(context)}
    for item in context.by_media("audio"):
        if "voice" in item.effective_usage and item.speaker in subjects and item.source:
            voices.setdefault(item.speaker, []).append(item)
    return {subject: takes[0] for subject, takes in voices.items()}, \
           {subject: takes[1:] for subject, takes in voices.items() if len(takes) > 1}


def extra_voice_issues(extra):
    """One Issue per further take, naming the subject it was meant for."""
    out = []
    for takes in extra.values():
        for item in takes:
            out.append(Issue("voice_extra_take",
                             "is a further voice take for the same figure; the first take keeps the subject's voice "
                             "slot and this one is sent as an additional reference.", item.name))
    return out


def _tag_substitutor(slot_items, context):
    names = {context.item(i).name: "@ref%d" % n for n, i in enumerate(slot_items, 1)}
    return lambda text: replace_mentions(text, names, (item.name for item in context.items))


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
        usage = next((u for u in item.effective_usage if u in _AUDIO_RETENTION), None)
        if usage is None:
            continue
        timed = usage in ("copy", "lock")
        source_start = int(round(item.options.start_s * 24))
        source_end = item.options.end_s or item.length_s
        available = max(0, int(round((source_end - item.options.start_s) * 24))) if source_end else 0
        start, length, trim = _window_frames(chunk, source_start) if timed else (FAR_AWAY, available or int(max(item.length_s, 2.0) * 24), source_start)
        if timed and available:
            length = min(length, max(0, source_start + available - trim))
            if not length:
                continue
        segments.append({"type": "audio", "audioFile": item.source, "fileName": item.name, "start": start, "length": length,
                         "trimStart": trim, "retention": _AUDIO_RETENTION[usage], "ng_item": item.id})
    return segments


def _motion_segments(context):
    out = []
    for item in context.by_media("video"):
        if item.source and set(item.effective_usage) & {"motion", "camera", "structure"}:
            length = int(round(((item.options.end_s or item.length_s or 5.0) - item.options.start_s) * 24))
            out.append({"type": "video", "videoFile": item.source, "fileName": item.name, "start": FAR_AWAY, "length": length,
                        "trimStart": int(round(item.options.start_s * 24)), "retention": _RETENTION[item.preserve],
                        "ng_item": item.id, "paired_audio": item.options.video_audio == "reference"})
    return out


def _shot_text(shot, substitute, automatic=False, context=None):
    """A shot that began in an earlier chunk keeps its action but not its spoken lines: those belong to where the shot starts."""
    text = substitute(spoken_text(shot, context)[0] if context else shot.text)
    if shot.carried:
        text = "\n".join(line for line in text.splitlines() if not plan.DIALOGUE_RE.match(line.strip()))
        if automatic and text.strip():
            text = "Continue the same scene and action from the preceding video, preserving the subject and setting. " + text
    return text


def _anchor_segments(context, chunk, is_last):
    """Images used as first/last frame: only the first chunk takes a first frame and only the last chunk takes a last frame.

    Each segment carries `ng_item` so a card can be told from its file alone; two cards may hold the same image.
    """
    out = []
    for item in context.by_media("image"):
        usage = item.effective_usage
        if "first_frame" in usage and chunk.is_first:
            out.append({"type": "image", "imageFile": item.source, "fileName": item.name, "start": 0,
                        "length": max(chunk.sampled_frames // 8, 1), "prompt": "", "ng_item": item.id})
        if "last_frame" in usage and is_last:
            out.append({"type": "image", "imageFile": item.source, "fileName": item.name, "isEndFrame": True,
                        "start": chunk.sampled_frames - max(chunk.sampled_frames // 8, 1),
                        "length": max(chunk.sampled_frames // 8, 1), "prompt": "", "ng_item": item.id})
    return out


def _global_prompt(context):
    parts = [context.idea.strip()] if context.shots_text.strip() else []
    if context.style and context.style != "None":
        parts.append("Visual style: %s." % context.style)
    for item in context.by_media("text"):
        if item.source.strip() and set(item.effective_usage) & {"style", "rule", "character", "world", "scene", "camera", "dialogue", "constraint", "instruction"}:
            owners = [context.item(identity).name for identity in item.subject_ids if context.item(identity)]
            prefix = "For %s: " % " and ".join("@" + name for name in owners) if owners else ""
            parts.append(prefix + item.source.strip())
    for item in context.by_media("video"):
        roles = set(item.effective_usage)
        if "camera" in roles:
            parts.append("Use %s as the camera movement reference. %s" % (item.name, item.description))
        if "structure" in roles:
            parts.append("Follow the overall scene structure and rhythm of %s. %s" % (item.name, item.description))
    for item in context.by_media("audio"):
        if "rhythm" in item.effective_usage:
            parts.append("Follow the rhythm of %s. %s" % (item.name, item.description))
    return " ".join(p for p in parts if p)


def build_timeline(context: DirectorContext, chunk: Chunk, mode: str):
    """Return (timeline_data dict, Mapping, voice_notes) for one chunk."""
    groups = subject_groups(context)
    subjects = [group.root for group in groups]
    voices, extra_voices = _voices_by_speaker(context)
    substitute = _tag_substitutor([s.id for s in subjects], context)
    segments = [{"type": "text", "start": s.local_start_f, "length": s.local_end_f - s.local_start_f,
                 "prompt": _shot_text(s, substitute, automatic=not context.shots_text.strip(), context=context)}
                for s in chunk.shots]
    segments += _anchor_segments(context, chunk, chunk.is_last)
    ref_on = mode == "ref2va"
    tdata = {"reference_mode": "REF2VA" if ref_on else "OFF", "prompt_format": "minimax", "global_prompt": substitute(_global_prompt(context)),
             "segments": segments, "subjects": [_slot(group.root, voices, group.images) for group in groups] if ref_on else [],
             "subjectSlotCount": max(len(subjects), 1), "audioSegments": _audio_segments(context, chunk, voices),
             "motionSegments": _motion_segments(context) if ref_on else [], "overall_soundscape": context.soundscape,
             "non_diegetic_music": context.music}
    by_source = {}
    anchors = {}
    for item in context.items:
        if item.media == "text":
            continue
        by_source.setdefault(item.source, item.id)
        for role, key in (("first_frame", plan.ROLE_FIRST), ("last_frame", plan.ROLE_LAST)):
            if role in item.effective_usage:
                anchors.setdefault((key, item.source), item.id)
    voice_items = {number: voices[s.id].id for number, s in enumerate(subjects, 1) if s.id in voices}
    notes = extra_voice_issues(extra_voices) + [issue for shot in chunk.shots for issue in spoken_text(shot, context)[1]]
    return tdata, Mapping([s.id for s in subjects], by_source, anchors, voice_items), notes
