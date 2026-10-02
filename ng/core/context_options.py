"""Editable media roles, retention details and selected source interval."""
import json
from dataclasses import dataclass

from . import fields

PROPERTIES = ("identity", "face", "hair", "outfit", "body", "pose", "style", "background", "lighting", "composition")
STRENGTHS = ("ignore", "low", "medium", "high", "keep")


@dataclass(frozen=True)
class ContextOptions:
    preserve: tuple = ()
    start_s: float = 0.0
    end_s: float = 0.0
    anchor_s: float = -1.0
    video_audio: str = "ignore"
    SCHEMA_VERSION = 1

    def to_dict(self):
        return {"schema_version": 1, "preserve": dict(self.preserve), "start_s": self.start_s,
                "end_s": self.end_s, "anchor_s": self.anchor_s, "video_audio": self.video_audio}

    @classmethod
    def from_dict(cls, data, path="context.options"):
        fields.need_dict(data, path)
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        if set(data) - set(cls().to_dict()):
            raise ValueError("Unknown context option; use supported role, retention and source timing controls.")
        preserve = fields.need_dict(data.get("preserve", {}), path + ".preserve")
        if set(preserve) - set(PROPERTIES) or any(value not in STRENGTHS for value in preserve.values()):
            raise ValueError("Choose a supported preserve property and strength.")
        start = float(fields.read_number(data, "start_s", path, 0.0, minimum=0))
        end = float(fields.read_number(data, "end_s", path, 0.0, minimum=0))
        if end and end <= start:
            raise ValueError("Source end must be later than source start; 0 means the file end.")
        return cls(tuple(preserve.items()), start, end, float(fields.read_number(data, "anchor_s", path, -1.0, minimum=-1)),
                   fields.read_choice(data, "video_audio", path, ("ignore", "reference"), "ignore"))

    @classmethod
    def from_json(cls, text):
        return cls.from_dict(json.loads(text)) if text else cls()


def roles(text, fallback):
    if not text:
        return (fallback,) if fallback else ()
    data = json.loads(text)
    if not isinstance(data, list) or not all(isinstance(value, str) and value for value in data):
        raise ValueError("Context roles must be a list of nonempty names.")
    return tuple(dict.fromkeys(data))


def retention_note(options):
    words = {"ignore": "allow to change", "low": "weak reference", "medium": "partially preserve",
             "high": "fully preserve", "keep": "preserve"}
    return "; ".join("%s: %s" % (name, words[value]) for name, value in options.preserve)
