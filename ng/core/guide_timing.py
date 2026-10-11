"""Plan actual native frame slots and Shot guides, before role aggregation loses binding order."""
from .context import USAGE_BY_MEDIA
from .frames import seconds_to_frames
from .issues import Issue
from .limits import FPS, GRID_STEP
from .media_ref import MediaRef
from .shot_document import read_document, bound_media_ids
from .shots import parse_shots


def _continue_ref(item, frame):
    ends = [value for value in (item.options.end_s, item.length_s) if value > 0]
    end = min(ends) if ends else 0
    if end and end <= item.options.start_s:
        return None
    start = max(item.options.start_s, end - 1) if end else item.options.start_s
    first = seconds_to_frames(start)
    length = max(1, min(FPS, seconds_to_frames(end) - first)) if end else FPS
    return MediaRef("continue_video", item.id, item.source, frame, length, first)


def _global_guides(context, chunk, bound):
    refs = []
    for kind, enabled, frame in (("first_frame", chunk.is_first, 0), ("last_frame", chunk.is_last, chunk.sampled_frames - 1)):
        items = [i for i in context.by_media("image") if i.id not in bound and i.source and kind in i.effective_usage]
        if enabled and items:
            refs.append(MediaRef(kind, items[0].id, items[0].source, frame, 1))
    for item in context.items:
        if item.id in bound or not item.source:
            continue
        if item.media == "image" and set(item.effective_usage) & {"keyframe", "storyboard"} and item.options.anchor_s >= 0:
            frame = seconds_to_frames(item.options.anchor_s)
            if chunk.story_start_f <= frame < chunk.story_end_f:
                refs.append(MediaRef("keyframe", item.id, item.source, frame - chunk.story_start_f + chunk.head_frames, 1))
        if item.media == "video" and "continue" in item.effective_usage and chunk.is_first:
            ref = _continue_ref(item, 0)
            if ref:
                refs.append(ref)
    return refs


def _bound_ref(item, role, shot, chunk, mode, at_s=-1.0):
    if item.media == "image" and role in ("first_frame", "last_frame"):
        frame = shot.start_f if role == "first_frame" else shot.end_f - 1
        if role == "last_frame" and chunk.is_last and abs(shot.end_f - chunk.story_end_f) < GRID_STEP:
            # the last shot ends where the project ends; the video itself ends on H3's grid, up to 16 frames off
            frame = chunk.story_end_f - 1
    elif item.media == "image" and role in ("keyframe", "storyboard"):
        # Placed on a shot in the Studio, a keyframe sits at its time inside the shot; without one, a time stored on an
        # older card, else the shot's start.
        if at_s >= 0:
            frame = shot.start_f + seconds_to_frames(at_s)
        else:
            frame = seconds_to_frames(item.options.anchor_s) if item.options.anchor_s >= 0 else shot.start_f
    elif item.media == "video" and role == "continue":
        frame = shot.start_f
    else:
        return None
    if not chunk.story_start_f <= frame < chunk.story_end_f:
        return None
    local = frame - chunk.story_start_f + chunk.head_frames
    if role == "continue":
        return _continue_ref(item, local)
    kind = "keyframe"
    if mode != "ref2va" and ((role == "first_frame" and local == 0) or
                            (role == "last_frame" and local == chunk.sampled_frames - 1)):
        kind = role
    elif mode != "ref2va" and role == "keyframe" and at_s >= 0 and local == chunk.sampled_frames - 1:
        kind = "last_frame"     # the part was planned to end on it (project._part_edges): the trained last-frame slot
    return MediaRef(kind, item.id, item.source, local, 1)


def plan_guides(context, chunk, mode):
    bound = bound_media_ids(context.shots_text)
    refs = _global_guides(context, chunk, bound)
    if read_document(context.shots_text) is None:
        return tuple(refs), ()
    shots, _ = parse_shots(context.shots_text, seconds_to_frames(context.project_seconds))
    active = {shot.shot_id for shot in chunk.shots}
    occupied = {ref.start_f: ref for ref in refs if ref.kind in ("first_frame", "last_frame")}
    issues = []
    for shot in shots:
        if shot.id not in active:
            continue
        for binding in shot.media:
            item = context.item(binding.context_id)
            if not item or not item.source:
                continue
            roles = (binding.role,) if binding.role in USAGE_BY_MEDIA[item.media] else item.effective_usage
            for role in roles:
                ref = _bound_ref(item, role, shot, chunk, mode, binding.at_s if role == "keyframe" else -1.0)
                if ref is None:
                    continue
                previous = occupied.get(ref.start_f)
                if previous:
                    if previous.ctx_id != ref.ctx_id:
                        issues.append(Issue("anchor_multiple", "Only one Shot guide at frame %d is used: '%s'; '%s' is skipped. "
                                            "Move or remove the conflicting binding." % (ref.start_f, context.item(previous.ctx_id).name, item.name), shot.id))
                    continue
                occupied[ref.start_f] = ref
                refs.append(ref)
    return tuple(refs), tuple(issues)
