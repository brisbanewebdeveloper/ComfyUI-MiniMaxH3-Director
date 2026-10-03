"""Resolve named video/audio mentions against the same presentation order as native H3."""
from .mentions import replace_mentions
from . import fields


def media_labels(context, refs):
    """Native H3 numbers video soundtracks before standalone audio references."""
    labels = []
    videos = [ref for ref in refs if ref.kind == "video"]
    audio_number = 0
    for number, ref in enumerate(videos, 1):
        labels.append(("<Video %d>" % number, ref.ctx_id))
        if context.item(ref.ctx_id).options.video_audio == "reference":
            audio_number += 1
            labels.append(("<Audio %d>" % audio_number, ref.ctx_id))
    for number, ref in enumerate((ref for ref in refs if ref.kind == "audio"), audio_number + 1):
        labels.append(("<Audio %d>" % number, ref.ctx_id))
    return tuple(labels)


def resolve_media_mentions(prompt, context, refs):
    # A video's @name denotes its picture stream, rather than its paired soundtrack.
    labels = {identity: label for label, identity in reversed(media_labels(context, refs))}
    names = {item.name:labels[item.id] for item in context.items if item.id in labels}
    return replace_mentions(prompt, names)


def prompt_labels(result, mapping, context, refs):
    labels = [("<Picture %d>" % number, ref.ctx_id) for number, ref in
              enumerate((ref for ref in refs if ref.kind == "picture"), 1)]
    labels += [("<Subject %d>" % subject, mapping.slot_items[slot - 1]) for slot, subject in result["subject_of_slot"].items()]
    for slot in result["ref_image_slots"]:
        if slot.get("source") == "timeline" and slot.get("subject"):
            source = slot["event"]["seg"].get("imageFile", "")
            labels.append(("<Subject %d>" % slot["subject"], mapping.media_id(slot["event"]["seg"], source)))
    return tuple(labels) + media_labels(context, refs)


def read_prompt_labels(data, path):
    labels = fields.need_dict(data.get("prompt_labels", {}), path + ".prompt_labels")
    return tuple((label, fields.read_str(labels, label, path + ".prompt_labels")) for label in labels)
