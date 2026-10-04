"""Select shot-bound contexts before invoking the existing H3 compiler.

Contexts not assigned to any shot retain their legacy global scope. A bound
context follows every chunk (including its pinned head) intersecting that shot.
Subject/voice dependencies remain available; no media is loaded here.
"""
from dataclasses import replace

from .context import USAGE_BY_MEDIA
from .issues import Issue
from .shot_document import read_document
from .subjects import subject_groups
from .context_checks import check_context


def _add_roles(roles, identity, values):
    roles[identity] = tuple(dict.fromkeys((*roles.get(identity, ()), *values)))


def scoped_context(context, chunk):
    records = read_document(context.shots_text)
    if records is None:
        return context, ()
    bound = {b["context_id"] for record in records for b in record.get("media", [])}
    bound.update(s["speaker_id"] for record in records for s in record.get("spoken", []) if s.get("speaker_id"))
    selected = {item.id for item in context.items if item.id not in bound}
    roles, issues = {}, []
    for shot in chunk.shots:
        for binding in shot.media:
            item = context.item(binding.context_id)
            if item is None:
                issues.append(Issue("shot_context_unknown", "Bound context '%s' is disconnected; reconnect or remove this binding."
                                    % binding.context_id, shot.shot_id))
                continue
            selected.add(item.id)
            if binding.role == "context":
                _add_roles(roles, item.id, item.effective_usage)
            elif binding.role in USAGE_BY_MEDIA[item.media]:
                _add_roles(roles, item.id, (binding.role,))
            else:
                issues.append(Issue("shot_role_unknown", "Role '%s' is not valid for %s; the context's own role is used."
                                    % (binding.role, item.media), shot.shot_id))
                _add_roles(roles, item.id, item.effective_usage)
        selected.update(s.speaker_id for s in shot.spoken if context.item(s.speaker_id))
    # A scoped asset still needs its owning Subject; voice samples need the image
    # they speak for. Following only outward dependencies avoids pulling unused takes.
    pending = list(selected)
    while pending:
        item = context.item(pending.pop())
        if item is None:
            continue
        for identity in (*item.subject_ids, item.speaker):
            if identity and context.item(identity) and identity not in selected:
                selected.add(identity)
                pending.append(identity)
    items = tuple(replace(item, usage=roles[item.id]) if item.id in roles else item
                  for item in context.items if item.id in selected)
    scoped = replace(context, items=items)
    return scoped, tuple(issues + check_context(scoped))


def spoken_text(shot, context):
    """Translate active dialogue to the legacy compiler grammar, without an AI."""
    lines, issues = [], []
    subjects = {image.id: group.root for group in subject_groups(context) for image in group.images}
    for spoken in shot.spoken:
        if not spoken.text.strip():
            continue
        item = context.item(spoken.speaker_id) if spoken.speaker_id else None
        if spoken.speaker_id and not item:
            issues.append(Issue("shot_speaker_unknown", "Speaker '%s' is disconnected; the exact line is kept as a narrator."
                                % spoken.speaker_id, shot.shot_id))
        subject = subjects.get(spoken.speaker_id)
        speaker = "@" + subject.name if subject else "@voice(%s)" % (spoken.voice or "a narrator")
        if item and not subject:
            issues.append(Issue("shot_speaker_unbound", "Speaker '%s' has no image Subject; narrator voice is used." % item.name, shot.shot_id))
        lines.append("%s [%s] %s: %s" % (speaker, spoken.language or "English", spoken.delivery or "says", spoken.text))
    return "\n".join((shot.text, *lines)), tuple(issues)
