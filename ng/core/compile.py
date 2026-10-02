"""Compile one chunk of a Director Context into what the model needs: the H3 prompt and the list of media to send, in label order.

The compiling itself is the legacy planner's (see legacy_bridge); this module turns its result into NG's own types, so nothing
above it depends on legacy dictionaries, and attaches NG's warnings.
"""
from dataclasses import dataclass

from ... import minimax_plan as plan
from . import fields, limits
from .chunks import Chunk, ContinuityPlan
from .context import DirectorContext, check_item
from .issues import Issue
from .legacy_bridge import build_timeline, decide_mode

KINDS = ("picture", "video", "audio", "lock", "first_frame", "last_frame")


@dataclass(frozen=True)
class MediaRef:
    kind: str
    ctx_id: str
    source: str
    start_f: int = 0
    length_f: int = 0
    trim_start_f: int = 0
    SCHEMA_VERSION = 1

    def to_dict(self):
        return {"schema_version": self.SCHEMA_VERSION, "kind": self.kind, "ctx_id": self.ctx_id, "source": self.source,
                "start_f": self.start_f, "length_f": self.length_f, "trim_start_f": self.trim_start_f}

    @classmethod
    def from_dict(cls, data, path="ref"):
        data = fields.need_dict(data, path)
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        return cls(kind=fields.read_choice(data, "kind", path, KINDS, None), ctx_id=fields.read_str(data, "ctx_id", path),
                   source=fields.read_str(data, "source", path), start_f=int(fields.read_number(data, "start_f", path, 0)),
                   length_f=int(fields.read_number(data, "length_f", path, 0)), trim_start_f=int(fields.read_number(data, "trim_start_f", path, 0)))


@dataclass(frozen=True)
class CompiledChunk:
    index: int
    mode: str                  # t2va | fl2va | ref2va
    prompt: str
    refs: tuple = ()           # MediaRef in the order the labels <Picture N>/<Video N>/<Audio N> number them
    issues: tuple = ()
    SCHEMA_VERSION = 1

    def of_kind(self, kind):
        return tuple(r for r in self.refs if r.kind == kind)

    def to_dict(self):
        return {"schema_version": self.SCHEMA_VERSION, "index": self.index, "mode": self.mode, "prompt": self.prompt,
                "refs": [r.to_dict() for r in self.refs], "issues": [i.to_dict() for i in self.issues]}

    @classmethod
    def from_dict(cls, data, path="compiled"):
        data = fields.need_dict(data, path)
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        return cls(index=int(fields.read_number(data, "index", path, minimum=0)), mode=fields.read_choice(data, "mode", path, ("t2va", "fl2va", "ref2va"), None),
                   prompt=fields.read_str(data, "prompt", path),
                   refs=tuple(MediaRef.from_dict(d, "%s.refs[%d]" % (path, n)) for n, d in enumerate(fields.read_list(data, "refs", path))),
                   issues=tuple(Issue.from_dict(d) for d in fields.read_list(data, "issues", path)))


def _picture_refs(result, mapping):
    refs = []
    for slot in result["ref_image_slots"]:
        if slot["source"] == "char":
            ctx = mapping.slot_items[slot["slot"]]
            refs.append(MediaRef("picture", ctx, slot["image"].get("name", "")))
        elif slot["source"] == "timeline":
            source = slot["event"]["seg"].get("imageFile", "")
            refs.append(MediaRef("picture", mapping.by_source.get(source, ""), source))
    return refs


def _anchor_refs(result, mapping):
    refs = []
    for event in result["events"]:
        source = event["seg"].get("imageFile", "")
        kind = {plan.ROLE_FIRST: "first_frame", plan.ROLE_LAST: "last_frame"}.get(event["role"])
        if kind and source:
            refs.append(MediaRef(kind, mapping.by_source.get(source, ""), source))
    return refs


def _timed(kind, seg, key, mapping):
    source = seg.get(key, "")
    return MediaRef(kind, mapping.by_source.get(source, ""), source, int(seg.get("start", 0)) if kind == "lock" else 0,
                    int(seg.get("length", 0)), int(seg.get("trimStart", 0)))


def _media_refs(result, mapping):
    refs = _picture_refs(result, mapping)
    refs += [_timed("video", s, "videoFile", mapping) for s in result["ref_video_segs"]]
    refs += [_timed("audio", s, "audioFile", mapping) for s in result["ref_audio_segs"]]
    refs += [_timed("lock", s, "audioFile", mapping) for s in result["lock_audio_segs"]]
    return refs + _anchor_refs(result, mapping)


def _issues(context, chunk, result, continuity):
    # a continued chunk deliberately has no spoken line for a shot that began earlier (see legacy_bridge._shot_text)
    resumed = any(s.carried for s in chunk.shots)
    out = [Issue("planner", text, "chunk %d" % (chunk.index + 1)) for text in result["ref_warnings"]
           if not (resumed and "has no spoken line" in text)]
    for item in context.items:
        out.extend(check_item(item))
    if not context.idea.strip() and not any(s.text.strip() for s in chunk.shots):
        out.append(Issue("no_text", "There is no text for this chunk; the prompt falls back to a bare placeholder.", "chunk %d" % (chunk.index + 1)))
    if chunk.head_frames and continuity.mode == "video_audio" and result["lock_audio_segs"]:
        out.append(Issue("lock_and_pin", "Locked audio and a pinned audio tail both write the sound of the first second; the lock wins.",
                         "chunk %d" % (chunk.index + 1)))
    return out


def compile_chunk(context: DirectorContext, chunk: Chunk, continuity: ContinuityPlan) -> CompiledChunk:
    mode = decide_mode(context)
    tdata, mapping = build_timeline(context, chunk, mode)
    result = plan.plan_timeline(tdata, 0, chunk.sampled_frames, float(limits.FPS), use_custom_audio=True, use_custom_motion=True,
                                prepend_text=context.prepend_text, prompt_format="minimax")
    return CompiledChunk(index=chunk.index, mode=result["mode"], prompt=result["prompt"], refs=tuple(_media_refs(result, mapping)),
                         issues=tuple(_issues(context, chunk, result, continuity)))

