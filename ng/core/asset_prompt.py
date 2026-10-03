"""Refine grouped Subject definitions with property-scoped assets after native caps assign labels."""
from ... import minimax_plan as plan
from .issues import Issue
from .legacy_bridge import _kind, _RETENTION
from .context_options import retention_note
from .media_labels import prompt_labels
from .mentions import replace_mentions


def _asset_line(subject, label, item):
    role = " / ".join(item.content or ("appearance",)).replace("_", " ")
    detail = (" " + item.description.strip().rstrip(".") + ".") if item.description.strip() else ""
    note = retention_note(item.options)
    return "%s uses the %s reference in %s.%s Retention for this reference: %s%s." % (
        subject, role, label, detail, _RETENTION[item.preserve], "; " + note if note else "")


def _picture_definitions(prompt, result, mapping, context):
    for slot, number in result["subject_of_slot"].items():
        root = context.item(mapping.slot_items[slot - 1])
        pictures = [("<Picture %d>" % (ordinal + 1), context.item(ref["image"].get("ng_item") or root.id))
                    for ordinal, ref in enumerate(result["ref_image_slots"]) if ref["source"] == "char" and ref["slot"] == slot - 1]
        assets = [(label, item) for label, item in pictures if item.id != root.id]
        if not assets:
            continue
        subject = "<Subject %d>" % number
        original = plan._subject_sentence(subject, root.description, _kind(root), " and ".join(label for label, _ in pictures))
        primary = " and ".join(label for label, item in pictures if item.id == root.id)
        definition = plan._subject_sentence(subject, root.description, _kind(root), primary)
        definition += "\n" + "\n".join(_asset_line(subject, label, item) for label, item in assets)
        prompt = prompt.replace(original, definition, 1)
    return prompt


def _scope_text(prompt, mapping, context, subjects):
    for item in context.by_media("text"):
        if not item.subject_ids:
            continue
        original = "For " + " and ".join(subjects.get(identity, "@ref%d" % (mapping.slot_items.index(identity) + 1))
                                         for identity in item.subject_ids) + ":"
        retained = [subjects[identity] for identity in item.subject_ids if identity in subjects]
        replacement = "For " + " and ".join(retained) + ":" if retained else "Context guidance:"
        prompt = prompt.replace(original, replacement, 1)
    return prompt


def apply_asset_relations(result, mapping, context, refs):
    labels = prompt_labels(result, mapping, context, refs)
    subjects = {identity: label for label, identity in labels if label.startswith("<Subject ")}
    pairs = {(mapping.slot_items[ref["slot"]], ref["image"].get("ng_item") or mapping.slot_items[ref["slot"]])
             for ref in result["ref_image_slots"] if ref["source"] == "char"}
    owned, issues, video_lines = {}, [], []
    for label, identity in labels:
        if label.startswith(("<Picture ", "<Video ")):
            owned.setdefault(identity, label)
    for item in context.items:
        if not item.subject_ids:
            continue
        missing = [identity for identity in item.subject_ids if identity not in subjects]
        if item.media == "image":
            missing = [identity for identity in item.subject_ids if (identity, item.id) not in pairs]
        if missing or (item.media != "text" and item.id not in owned):
            names = ", ".join(context.item(identity).name for identity in missing)
            issues.append(Issue("asset_relation_unavailable", "Linked reference is not presented for %s in this chunk. "
                                "Check mode, source and reference budget; only retained relations are applied."
                                % (names or "its Subjects"), item.name))
        if item.media == "video" and item.id in owned:
            video_lines += [_asset_line(subjects[identity], owned[item.id], item) for identity in item.subject_ids if identity in subjects]
    prompt = _picture_definitions(result["prompt"], result, mapping, context)
    prompt = _scope_text(prompt, mapping, context, subjects)
    if video_lines:
        prompt = prompt.replace("\n\nsummary:", "\n" + "\n".join(video_lines) + "\n\nsummary:", 1)
    names = {item.name: owned[item.id] for item in context.by_media("image") if item.subject_ids and item.id in owned}
    return replace_mentions(prompt, names), tuple(issues)
