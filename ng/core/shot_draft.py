"""Validate ID-addressed proposals without editing the active shot document."""
import json
import re

from . import fields
from .context import USAGE_BY_MEDIA
from .frames import seconds_to_frames
from .shot_document import LOCK_FIELDS, MediaBinding, SpokenLine, read_document
from .shots import parse_shots

FORMAT = "h3-director-draft"


def current_records(text, seconds):
    records = read_document(text)
    if records is not None:
        return records
    shots, issues = parse_shots(text, seconds_to_frames(seconds))
    if issues:
        raise ValueError("Repair the existing shot timing/text before requesting AI suggestions.")
    return [dict(id=s.id, start=s.start_f / 24, end=s.end_f / 24, text=s.text,
                 media=[], spoken=[], locked_fields=[]) for s in shots]


def draft_prompt(idea, seconds, meanings, records):
    shots = [{key: r.get(key, [] if key in ("media", "spoken", "locked_fields") else "")
              for key in ("id", "start", "end", "text", "media", "spoken", "locked_fields")} for r in records]
    return ("Improve the existing Shots from the Idea and Context descriptions. Return only JSON: "
            '{"format":"h3-director-draft","schema_version":1,"patches":[{"shot_id":"existing ID",'
            '"fields":{"text":"action and camera prose","timing":{"start":0,"end":1},"media":[],"spoken":[]}}]}. '
            "The example lists allowed fields; omit every field that does not need changes. "
            "You may also propose timing, media or spoken fields and project soundscape/music strings. "
            "Include soundscape/music only for a concrete requested change; never copy schema placeholders. "
            "Use existing Shot IDs; never add, delete or reorder Shots. Respect locked_fields. "
            "Patch fields may contain only text, timing, media and spoken; never copy id, draft or locked_fields into fields. "
            "Preserve every existing spoken entry and exact inline dialogue; new dialogue is optional. "
            "Media bindings use schema_version 1, context_id and a supported role, not filenames. "
            "Spoken entries use schema_version 1, speaker_id, voice, language, delivery and text. "
            "Timing is finite seconds in 0..%s, end greater than start; avoid overlaps. "
            "Use only supplied names for @Name and Context IDs for bindings. Do not claim generation or media analysis has occurred. "
            "Idea: %s\nContexts: %s\nExisting Shots: %s" %
            (seconds, idea, json.dumps(meanings, ensure_ascii=False), json.dumps(shots, ensure_ascii=False)))


def check_mentions(text, contexts):
    if contexts is None:
        return
    names = {entry["widgets"].get("name", "").casefold() for entry in contexts}
    known = sorted((re.escape(name) for name in names if name), key=len, reverse=True)
    pattern = r"@(" + "|".join(known + [r"voice\([^)]*\)", r"ref\d+", r"audio\d+", r"[\w-]+"]) + r")(?![\w])"
    for name in re.findall(pattern, text, re.IGNORECASE):
        if name.casefold() not in names and not re.fullmatch(r"voice\([^)]*\)|ref\d+|audio\d+", name, re.I):
            raise ValueError("Auto Direct referenced an unknown context: @%s." % name)


def keep_inline_words(proposed, original):
    lines = [line for line in original.splitlines() if line.strip().startswith("@") and ":" in line]
    if not lines:
        return proposed
    prose = [line for line in proposed.splitlines() if not (line.strip().startswith("@") and ":" in line)]
    return "\n".join([*prose, *lines])


def _field_value(key, value, record, seconds, contexts):
    by_id = {entry["widgets"].get("context_id"): entry for entry in contexts or ()}
    if key == "text":
        text = fields.read_str({key: value}, key, "draft.fields").strip()
        if not text:
            raise ValueError("A proposed action must not be empty.")
        check_mentions(text, contexts)
        return keep_inline_words(text, record["text"])
    if key == "timing":
        fields.need_dict(value, "draft.timing")
        start = fields.read_number(value, "start", "draft.timing", minimum=0)
        end = fields.read_number(value, "end", "draft.timing", minimum=0)
        if end <= start or end > seconds:
            raise ValueError("Proposed timing is outside the project or has no duration.")
        return dict(start=start, end=end)
    entries = fields.read_list({key: value}, key, "draft.fields")
    parsed = [(MediaBinding if key == "media" else SpokenLine).from_dict(entry).to_dict() for entry in entries]
    existing = [(MediaBinding if key == "media" else SpokenLine).from_dict(entry).to_dict() for entry in record.get(key, [])]
    for entry in parsed:
        identity = entry["context_id"] if key == "media" else entry["speaker_id"]
        if identity and identity not in by_id and entry not in existing:
            raise ValueError("The draft binds an unknown Context ID: %s." % identity)
        if key == "media" and identity in by_id:
            if entry["role"] != "context" and entry["role"] not in USAGE_BY_MEDIA[by_id[identity]["media"]]:
                raise ValueError("The draft uses an unsupported media role.")
        if key == "spoken" and identity in by_id and by_id[identity]["media"] != "image":
            raise ValueError("A spoken speaker must be a Subject image or the narrator.")
    if key == "spoken" and parsed[:len(existing)] != existing:
        raise ValueError("Keep the existing spoken words and order; new lines may be appended.")
    return parsed


def parse_draft(data, records, seconds, contexts):
    if data.get("format") != FORMAT:
        raise ValueError("Existing Shots need an ID-addressed draft, not a scene replacement.")
    fields.check_version(data, "draft", 1)
    if set(data) - {"format", "schema_version", "patches", "soundscape", "music"}:
        raise ValueError("Unexpected scene replacement fields in the Shot draft.")
    patches = fields.read_list(data, "patches", "draft")
    if len(patches) > 64:
        raise ValueError("A draft can propose at most 64 Shot patches.")
    by_id, seen, validated = {record["id"]: record for record in records}, set(), []
    for patch in patches:
        fields.need_dict(patch, "draft.patch")
        identity = fields.read_str(patch, "shot_id", "draft.patch")
        if identity not in by_id or identity in seen:
            raise ValueError("Draft Shot IDs must exist and occur only once.")
        seen.add(identity)
        changes = fields.need_dict(patch.get("fields"), "draft.fields")
        if not changes or set(changes) - set(LOCK_FIELDS):
            raise ValueError("Draft fields must be timing, text, media or spoken.")
        validated.append(dict(shot_id=identity, fields={key: _field_value(key, value, by_id[identity], seconds, contexts)
                                                      for key, value in changes.items()}))
    result = dict(format=FORMAT, schema_version=1, patches=validated)
    for key in ("soundscape", "music"):
        if key in data:
            result[key] = fields.read_str(data, key, "draft")
    if not patches and not any(result.get(key, "").strip() for key in ("soundscape", "music")):
        raise ValueError("The draft has no proposed changes.")
    return result
