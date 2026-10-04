"""Versioned shot data in the existing String input; timed text remains readable.

IDs identify story units, never their current array index or chunk position. Drafts
and locks are editing metadata; only active text, media and spoken lines compile.
"""
import json
from dataclasses import dataclass

from . import fields
from .issues import SchemaError

FORMAT = "h3-director-shots"
LOCK_FIELDS = ("timing", "text", "media", "spoken")


@dataclass(frozen=True)
class MediaBinding:
    context_id: str
    role: str = "context"
    SCHEMA_VERSION = 1

    def to_dict(self):
        return {"schema_version": 1, "context_id": self.context_id, "role": self.role}

    @classmethod
    def from_dict(cls, data, path="binding"):
        fields.need_dict(data, path)
        fields.check_version(data, path, 1)
        identity = fields.read_str(data, "context_id", path)
        if not identity.strip():
            raise SchemaError(path + ".context_id", "must not be empty")
        return cls(identity, fields.read_str(data, "role", path, "context"))


@dataclass(frozen=True)
class SpokenLine:
    text: str
    speaker_id: str = ""
    voice: str = "a narrator"
    language: str = "English"
    delivery: str = "says"
    SCHEMA_VERSION = 1

    def to_dict(self):
        return {"schema_version": 1, "text": self.text, "speaker_id": self.speaker_id,
                "voice": self.voice, "language": self.language, "delivery": self.delivery}

    @classmethod
    def from_dict(cls, data, path="spoken"):
        fields.need_dict(data, path)
        fields.check_version(data, path, 1)
        values = {key: fields.read_str(data, key, path, default) for key, default in
                  (("text", ""), ("speaker_id", ""), ("voice", "a narrator"),
                   ("language", "English"), ("delivery", "says"))}
        for key in ("speaker_id", "voice", "language", "delivery"):
            if any(c in values[key] for c in "\n\r[]():"):
                raise SchemaError(path + "." + key, "contains a dialogue syntax delimiter")
        if "\n" in values["text"] or "\r" in values["text"]:
            raise SchemaError(path + ".text", "one spoken line per entry; add another entry for another line")
        return cls(**values)


def read_document(text):
    """None means legacy timed text. Invalid structured data is never downgraded."""
    if not text.lstrip().startswith("{"):
        return None
    try:
        data = json.loads(text)
    except (ValueError, TypeError) as error:
        raise SchemaError("shots", "invalid JSON: %s" % error) from error
    fields.need_dict(data, "shots")
    if data.get("format") != FORMAT:
        raise SchemaError("shots.format", "expected " + FORMAT)
    fields.check_version(data, "shots", 1)
    records = fields.read_list(data, "shots", "shots")
    seen = set()
    for index, record in enumerate(records):
        path = "shots.shots[%d]" % index
        fields.need_dict(record, path)
        identity = fields.read_str(record, "id", path)
        if not identity.strip() or identity in seen:
            raise SchemaError(path + ".id", "must be nonempty and unique")
        seen.add(identity)
        fields.read_number(record, "start", path, minimum=0)
        fields.read_number(record, "end", path, minimum=0)
        fields.read_str(record, "text", path)
        metadata(record, path)
        if record.get("draft") is not None:
            fields.need_dict(record["draft"], path + ".draft")
    return records


def metadata(record, path="shot"):
    media = tuple(MediaBinding.from_dict(b, "%s.media[%d]" % (path, i))
                  for i, b in enumerate(fields.read_list(record, "media", path)))
    spoken = tuple(SpokenLine.from_dict(s, "%s.spoken[%d]" % (path, i))
                   for i, s in enumerate(fields.read_list(record, "spoken", path)))
    locks = fields.read_texts(record, "locked_fields", path)
    if any(value not in LOCK_FIELDS for value in locks):
        raise SchemaError(path + ".locked_fields", "expected timing, text, media or spoken")
    return {"id": record["id"], "media": media, "spoken": spoken, "locked_fields": locks}


def bound_media_ids(text):
    records = read_document(text)
    return {binding["context_id"] for record in records or () for binding in record.get("media", [])}
