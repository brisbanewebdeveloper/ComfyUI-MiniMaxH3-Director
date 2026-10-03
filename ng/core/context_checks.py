"""Cross-item diagnostics before legacy compilation; never hide ambiguous or discarded inputs."""
from .issues import Issue
from . import frames


def check_context(context):
    issues = []
    subjects = {i.id for i in context.by_media("image") if "reference" in i.effective_usage and i.source and not i.subject_ids}
    for role in ("first_frame", "last_frame"):
        items = [i for i in context.by_media("image") if role in i.effective_usage and i.source]
        if len(items) > 1:
            # H3 takes one frame per slot, so exactly the first one is sent. The warning has to say which one won,
            # otherwise the user cannot tell why their second image seems to be ignored.
            issues.append(Issue("anchor_multiple", "Only one %s is sent to the model; '%s' is used and these are "
                                "ignored: %s. Remove the unused ones or keep them as Reference."
                                % (role.replace("_", " "), items[0].name, ", ".join(i.name for i in items[1:]))))
    sources = {}
    for item in context.items:
        if item.media != "text" and item.source:
            key = item.source
            if key in sources:
                issues.append(Issue("source_shared", "Shares a file with %s; each card keeps its own role and source selection."
                                    % sources[key], item.name))
            sources.setdefault(key, item.name)
        if item.media == "audio" and len(item.effective_usage) > 1:
            issues.append(Issue("audio_roles", "Only the first supported audio usage is applied; use one role per card.", item.name))
        if item.media == "audio" and "voice" in item.effective_usage and item.speaker and item.speaker not in subjects:
            issues.append(Issue("voice_unbound", "Speaker is not a reference image; this voice is sent as an unbound audio reference.", item.name))
        reference = (item.media == "image" and "reference" in item.effective_usage) or item.media == "video" or (
            item.media == "audio" and bool(set(item.effective_usage) & {"voice", "copy", "music_style", "rhythm", "sound_reference"}))
        if context.mode == "fl2va" and reference:
            issues.append(Issue("reference_disabled", "Is omitted by explicit fl2va mode; choose auto or ref2va to use it.", item.name))
    return issues


def check_guide_times(context, total_frames):
    issues = []
    for item in context.by_media("image"):
        if not item.source or not set(item.effective_usage) & {"keyframe", "storyboard"} or item.options.anchor_s < 0:
            continue
        if frames.seconds_to_frames(item.options.anchor_s) >= total_frames:
            issues.append(Issue("guide_outside_project", "Scene time %.3fs is outside the rendered video; choose %.3fs "
                                "or earlier, or extend the project." % (item.options.anchor_s,
                                                                      frames.frames_to_seconds(total_frames - 1)), item.name))
    return issues
