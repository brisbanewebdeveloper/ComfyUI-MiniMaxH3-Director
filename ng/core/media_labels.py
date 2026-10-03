"""Resolve named video/audio mentions against the same presentation order as native H3."""
import re


def resolve_media_mentions(prompt, context, refs):
    labels = {}
    videos = [ref for ref in refs if ref.kind == "video"]
    for number, ref in enumerate(videos, 1):
        labels[ref.ctx_id] = "<Video %d>" % number
    offset = sum(context.item(ref.ctx_id).options.video_audio == "reference" for ref in videos)
    for number, ref in enumerate((ref for ref in refs if ref.kind == "audio"), offset + 1):
        labels[ref.ctx_id] = "<Audio %d>" % number
    names = {item.name:labels[item.id] for item in context.items if item.id in labels}
    if not names:
        return prompt
    pattern = re.compile(r"@(%s)(?![\w])" % "|".join(re.escape(name) for name in sorted(names, key=len, reverse=True)), re.IGNORECASE)
    folded = {name.casefold():label for name,label in names.items()}
    return pattern.sub(lambda match:folded[match.group(1).casefold()], prompt)
