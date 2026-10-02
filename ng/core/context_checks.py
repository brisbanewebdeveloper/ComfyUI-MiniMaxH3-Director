"""Cross-item diagnostics before legacy compilation; never hide ambiguous or discarded inputs."""
from .issues import Issue


def check_context(context):
    issues = []
    subjects = {i.id for i in context.by_media("image") if "reference" in i.effective_usage and i.source}
    for role in ("first_frame", "last_frame"):
        items = [i for i in context.by_media("image") if role in i.effective_usage and i.source]
        if len(items) > 1:
            issues.append(Issue("anchor_multiple", "Only one %s can be applied; keep one of: %s."
                                % (role, ", ".join(i.name for i in items))))
    sources = {}
    for item in context.items:
        if item.media != "text" and item.source:
            key = item.source
            if key in sources:
                issues.append(Issue("source_shared", "Shares a file with %s; reference labels for that file use the first item."
                                    % sources[key], item.name))
            sources.setdefault(key, item.name)
        if item.media == "audio" and len(item.effective_usage) > 1:
            issues.append(Issue("audio_roles", "Only the first supported audio usage is applied; use one role per card.", item.name))
        if item.media == "audio" and "voice" in item.effective_usage and item.speaker and item.speaker not in subjects:
            issues.append(Issue("voice_unbound", "Speaker is not a reference image; this voice is sent as an unbound audio reference.", item.name))
        reference = (item.media == "image" and "reference" in item.effective_usage) or item.media == "video" or (
            item.media == "audio" and bool(set(item.effective_usage) & {"voice", "copy", "music_style"}))
        if context.mode == "fl2va" and reference:
            issues.append(Issue("reference_disabled", "Is omitted by explicit fl2va mode; choose auto or ref2va to use it.", item.name))
    return issues
