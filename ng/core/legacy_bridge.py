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
from .shot_document import has_shots
from .audio_timing import clip_windows, shot_windows, source_window, timed_segments

FAR_AWAY = 10 ** 6          # parked past any window: a reference, not part of the soundtrack
_KIND = {"character": "person", "face": "person", "animal": "animal", "object": "object", "outfit": "clothing", "prop": "prop",
         "environment": "environment", "location": "environment", "style": "style", "lighting": "style", "composition": "style",
         "pose": "pose", "action": "action", "expression": "expression", "effect": "effect"}
_RETENTION = {"high": "fully_preserved", "medium": "partially_preserved", "low": "weak_reference"}
_AUDIO_RETENTION = {"voice": "reference", "music_style": "weak_reference", "copy": "fully_copy", "lock": "lock",
                    "rhythm": "weak_reference", "sound_reference": "reference"}


class Mapping:
    """What each legacy slot or file stands for, so results can be translated back to context ids.

    `by_source` is only a fallback; planned guides already carry their Context IDs.
    """

    def __init__(self, slot_items, by_source, voice_items=None):
        self.slot_items = tuple(slot_items)   # context id per legacy subject slot (slot number - 1)
        self.by_source = dict(by_source)      # file path -> context id (first item wins)
        self.voice_items = dict(voice_items or {})     # 1-based subject slot -> voice context id

    def media_id(self, seg, source):
        return seg.get("ng_item") or self.voice_items.get(seg.get("voice_slot")) or self.by_source.get(source, "")

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


def _plain_substitutor(subjects, context):
    """Without reference slots there is no <Subject N> to point at: a mention is the name, a spoken line names its voice."""
    known = [item.name for item in context.items]
    names, voices = {s.name: s.name for s in subjects}, {s.name: "@voice(%s)" % s.name for s in subjects}

    def substitute(text):
        lines = []
        for line in text.splitlines():
            head, colon, rest = line.partition(":")
            spoken = replace_mentions(head, voices, known) + colon + replace_mentions(rest, names, known)
            lines.append(spoken if colon and plan.DIALOGUE_RE.match(spoken.strip()) else replace_mentions(line, names, known))
        return "\n".join(lines)
    return substitute


def _lane_references(item, chunk, spans):
    """A reference clip is not placed in the soundtrack; it is sent once to every chunk whose window it touches."""
    window_start = chunk.story_start_f - chunk.head_frames
    source_start, available = source_window(item)
    out = []
    for origin, end, offset in spans:
        if end <= window_start or origin >= chunk.story_end_f:
            continue
        length = end - origin if available is None else min(end - origin, available - offset)
        usage = next((u for u in item.effective_usage if u in _AUDIO_RETENTION and u not in ("copy", "lock")), "sound_reference")
        if length > 0:
            out.append({"type": "audio", "audioFile": item.source, "fileName": item.name, "start": FAR_AWAY, "length": length,
                        "trimStart": source_start + offset, "retention": _AUDIO_RETENTION[usage], "ng_item": item.id})
    return out[:1]


def _audio_segments(context, chunk, voices):
    segments = []
    used = {v.id for v in voices.values()}
    windows = shot_windows(context)
    lanes = {mode: clip_windows(context, (mode,)) for mode in ("lock", "copy", "ref")}
    for item in context.by_media("audio"):
        if item.id in used or not item.source:
            continue
        if any(item.id in spans for spans in lanes.values()):
            for mode in ("lock", "copy"):
                if item.id in lanes[mode]:
                    segments.extend(timed_segments(item, chunk, lanes[mode], _AUDIO_RETENTION[mode]))
            segments.extend(_lane_references(item, chunk, lanes["ref"].get(item.id, ())))
            continue
        usage = next((u for u in item.effective_usage if u in _AUDIO_RETENTION), None)
        if usage is None:
            continue
        if usage in ("copy", "lock"):
            segments.extend(timed_segments(item, chunk, windows, _AUDIO_RETENTION[usage]))
        else:
            source_start, available = source_window(item)
            segments.append({"type": "audio", "audioFile": item.source, "fileName": item.name, "start": FAR_AWAY,
                             "length": available if available is not None else 48, "trimStart": source_start,
                             "retention": _AUDIO_RETENTION[usage], "ng_item": item.id})
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


def _anchor_segments(context, chunk, guides):
    """Only actual native edge slots become legacy first/last-frame declarations."""
    out = []
    for ref in guides:
        item = context.item(ref.ctx_id)
        if ref.kind == "first_frame":
            out.append({"type": "image", "imageFile": item.source, "fileName": item.name, "start": 0,
                        "length": max(chunk.sampled_frames // 8, 1), "prompt": "", "ng_item": item.id})
        if ref.kind == "last_frame":
            out.append({"type": "image", "imageFile": item.source, "fileName": item.name, "isEndFrame": True,
                        "start": chunk.sampled_frames - max(chunk.sampled_frames // 8, 1),
                        "length": max(chunk.sampled_frames // 8, 1), "prompt": "", "ng_item": item.id})
    return out


def _global_prompt(context):
    parts = [context.idea.strip()] if has_shots(context.shots_text) else []
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


def build_timeline(context: DirectorContext, chunk: Chunk, mode: str, guides):
    """Return (timeline_data dict, Mapping, voice_notes) for one chunk."""
    groups = subject_groups(context)
    subjects = [group.root for group in groups]
    voices, extra_voices = _voices_by_speaker(context)
    substitute = _tag_substitutor([s.id for s in subjects], context) if mode == "ref2va" else _plain_substitutor(subjects, context)
    segments = [{"type": "text", "start": s.local_start_f, "length": s.local_end_f - s.local_start_f,
                 "prompt": _shot_text(s, substitute, automatic=not has_shots(context.shots_text), context=context)}
                for s in chunk.shots]
    segments += _anchor_segments(context, chunk, guides)
    ref_on = mode == "ref2va"
    tdata = {"reference_mode": "REF2VA" if ref_on else "OFF", "prompt_format": "minimax", "global_prompt": substitute(_global_prompt(context)),
             "segments": segments, "subjects": [_slot(group.root, voices, group.images) for group in groups] if ref_on else [],
             "subjectSlotCount": max(len(subjects), 1), "audioSegments": _audio_segments(context, chunk, voices),
             "motionSegments": _motion_segments(context) if ref_on else [], "overall_soundscape": context.soundscape,
             "non_diegetic_music": context.music}
    by_source = {}
    for item in context.items:
        if item.media == "text":
            continue
        by_source.setdefault(item.source, item.id)
    voice_items = {number: voices[s.id].id for number, s in enumerate(subjects, 1) if s.id in voices}
    notes = extra_voice_issues(extra_voices) + [issue for shot in chunk.shots for issue in spoken_text(shot, context)[1]]
    return tdata, Mapping([s.id for s in subjects], by_source, voice_items), notes
