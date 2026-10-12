"""The picture segments the legacy compiler reads besides the shot texts: native First / Last frame slots, and storyboard
pictures in References mode."""
from .context import USAGE_BY_MEDIA
from .shot_document import bound_media_ids


def anchor_segments(context, chunk, guides):
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


def storyboard_segments(context, chunk, texts):
    """References mode: a Storyboard picture plans the shots it lies on (viewpoint, subject placement, shot order), as
    MiniMax's guide words it: "<Picture 3> is a storyboard reference for [Shot 1] and [Shot 2]". It is no frame of the
    video; before 2026-10-12 it became a keyframe guide at each shot's start and the sketch itself was pushed into the
    picture. A storyboard card on no shot plans the whole target video."""
    written = [s for s, seg in zip(chunk.shots, texts) if seg["prompt"].strip()]
    number = {s.shot_id: n for n, s in enumerate(written, 1)}
    planned, bound = {}, bound_media_ids(context.shots_text)
    for shot in chunk.shots:
        for binding in shot.media:
            item = context.item(binding.context_id)
            roles = (binding.role,) if binding.role in USAGE_BY_MEDIA["image"] else (item.effective_usage if item else ())
            if item and item.media == "image" and item.source and "storyboard" in roles and shot.shot_id in number:
                planned.setdefault(item.id, []).append(number[shot.shot_id])
    for item in context.by_media("image"):
        if item.source and item.id not in bound and "storyboard" in item.effective_usage:
            planned.setdefault(item.id, [])
    return [{"type": "image", "imageFile": context.item(i).source, "fileName": context.item(i).name, "start": 0, "length": 1,
             "prompt": "", "refRole": "storyboard", "shotNos": sorted(set(nos)), "ng_item": i} for i, nos in planned.items()]
