"""Context items (what the user's pictures, clips, sounds and notes MEAN) and the Director Context that gathers them.

A ContextItem separates CONTENT (what is in the medium) from USAGE (what H3 should do with it), as the spec asks. Both are
open vocabularies with known values; an unknown value is kept and reported, never silently mapped to something else.
"""
from dataclasses import dataclass

from . import fields
from .issues import Issue, SchemaError

MEDIA = ("image", "video", "audio", "text")
PRESERVE = ("low", "medium", "high")

CONTENT_KINDS = ("character", "face", "animal", "object", "outfit", "prop", "environment", "location", "style", "pose",
                 "action", "expression", "lighting", "effect", "composition",
                 "voice", "dialogue", "music", "ambience", "sound_effect", "camera_motion", "motion", "rules")
USAGE_BY_MEDIA = {
    "image": ("reference", "first_frame", "keyframe", "last_frame", "storyboard"),
    "video": ("motion", "camera"),
    "audio": ("voice", "copy", "lock", "music_style"),
    "text": ("style", "rule"),
}


@dataclass(frozen=True)
class ContextItem:
    id: str
    name: str
    media: str
    source: str = ""            # file path relative to the ComfyUI input folder; for text items the text itself
    content: tuple = ()
    usage: tuple = ()
    preserve: str = "high"
    description: str = ""       # what the item is, in one sentence (the compiler writes it into the definition line)
    speaker: str = ""           # audio: id of the item whose voice this is
    length_s: float = 0.0       # audio/video: duration in seconds when known (0 = unknown)
    color: str = ""             # "" = assigned automatically
    SCHEMA_VERSION = 1

    def to_dict(self):
        return {"schema_version": self.SCHEMA_VERSION, "id": self.id, "name": self.name, "media": self.media,
                "source": self.source, "content": list(self.content), "usage": list(self.usage), "preserve": self.preserve,
                "description": self.description, "speaker": self.speaker, "length_s": self.length_s, "color": self.color}

    @classmethod
    def from_dict(cls, data, path="context"):
        data = fields.need_dict(data, path)
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        media = fields.read_choice(data, "media", path, MEDIA, None)
        return cls(id=fields.read_str(data, "id", path), name=fields.read_str(data, "name", path), media=media,
                   source=fields.read_str(data, "source", path, ""), content=fields.read_texts(data, "content", path),
                   usage=fields.read_texts(data, "usage", path),
                   preserve=fields.read_choice(data, "preserve", path, PRESERVE, "high"),
                   description=fields.read_str(data, "description", path, ""),
                   speaker=fields.read_str(data, "speaker", path, ""), length_s=float(fields.read_number(data, "length_s", path, 0.0, minimum=0)),
                   color=fields.read_str(data, "color", path, ""))

    @property
    def effective_usage(self):
        """The usage the compiler acts on: what the user set, else the default role of the medium."""
        return self.usage or (USAGE_BY_MEDIA[self.media][0],)


def check_item(item):
    """Soft problems with one item. Hard problems are SchemaError at load time."""
    issues = []
    for value in item.content:
        if value not in CONTENT_KINDS:
            issues.append(Issue("content_unknown", "'%s' is not a known content kind; kept as written." % value, item.name))
    for value in item.usage:
        if value not in USAGE_BY_MEDIA[item.media]:
            issues.append(Issue("usage_unknown", "'%s' is not a usage for %s items; the compiler will ignore it."
                                % (value, item.media), item.name))
    if item.media != "text" and not item.source:
        issues.append(Issue("source_missing", "has no file; it cannot be sent to the model.", item.name))
    if item.media == "text" and not item.source.strip():
        issues.append(Issue("text_empty", "is empty.", item.name))
    return tuple(issues)


def new_item_id(existing, prefix="ctx_"):
    """Next free id of the form ctx_0001."""
    numbers = [int(i[len(prefix):]) for i in existing if i.startswith(prefix) and i[len(prefix):].isdigit()]
    return "%s%04d" % (prefix, (max(numbers) + 1) if numbers else 1)


def require_unique(items):
    seen = {}
    for item in items:
        if item.id in seen:
            raise SchemaError("context.%s" % item.id, "id used twice (%s and %s)" % (seen[item.id], item.name))
        seen[item.id] = item.name


@dataclass(frozen=True)
class DirectorContext:
    idea: str = ""
    project_seconds: float = 10.0
    width: int = 768
    height: int = 1152
    mode: str = "auto"          # auto | fl2va | ref2va
    shots_text: str = ""        # "0-8: text" lines; empty = the idea carries the whole project
    soundscape: str = ""
    music: str = ""
    prepend_text: str = ""
    items: tuple = ()
    SCHEMA_VERSION = 1

    def to_dict(self):
        return {"schema_version": self.SCHEMA_VERSION, "idea": self.idea, "project_seconds": self.project_seconds,
                "width": self.width, "height": self.height, "mode": self.mode, "shots_text": self.shots_text,
                "soundscape": self.soundscape, "music": self.music, "prepend_text": self.prepend_text,
                "items": [i.to_dict() for i in self.items]}

    @classmethod
    def from_dict(cls, data, path="director"):
        data = fields.need_dict(data, path)
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        items = tuple(ContextItem.from_dict(d, "%s.items[%d]" % (path, n)) for n, d in enumerate(fields.read_list(data, "items", path)))
        require_unique(items)
        return cls(idea=fields.read_str(data, "idea", path, ""),
                   project_seconds=fields.read_number(data, "project_seconds", path, 10.0, minimum=0.1),
                   width=int(fields.read_number(data, "width", path, 768, minimum=32)),
                   height=int(fields.read_number(data, "height", path, 1152, minimum=32)),
                   mode=fields.read_choice(data, "mode", path, ("auto", "fl2va", "ref2va"), "auto"),
                   shots_text=fields.read_str(data, "shots_text", path, ""), soundscape=fields.read_str(data, "soundscape", path, ""),
                   music=fields.read_str(data, "music", path, ""), prepend_text=fields.read_str(data, "prepend_text", path, ""),
                   items=items)

    def item(self, item_id):
        for found in self.items:
            if found.id == item_id:
                return found
        return None

    def by_media(self, media):
        return tuple(i for i in self.items if i.media == media)
